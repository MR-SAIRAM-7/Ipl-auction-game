import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, emitAck } from '../lib/socket.js';

/**
 * Peer-to-peer voice chat over a WebRTC mesh, signalled through Socket.IO.
 * A mesh is the right shape here: auction rooms are 2-8 friends, and it needs no SFU.
 *
 * Three things make this survive a real auction rather than just a happy-path demo:
 *
 * 1. Perfect negotiation. Two people can offer each other at the same moment; the
 *    "polite" side (lower socket id) rolls back instead of both sides deadlocking.
 * 2. Reconnects. Socket.IO hands out a NEW socket id after a dropout, which orphans
 *    every peer connection and drops us from the server's voice roster. We notice and
 *    rebuild the mesh instead of sitting there looking connected but silent.
 * 3. ICE restarts. A network blip puts a connection into 'failed'. We restart ICE
 *    rather than tearing the peer down permanently with no way back.
 *
 * Browsers only hand out a microphone in a secure context, so over a LAN IP you need
 * HTTPS (or a tunnel). We detect that and say so rather than failing silently.
 */

const REJOIN_ATTEMPTS = 8;
const REJOIN_DELAY_MS = 500;
/** If a newcomer's offer never lands, an existing peer takes over and offers instead. */
const OFFER_RESCUE_MS = 4000;
/** How long a peer may sit un-connected before we retry the whole ICE negotiation. */
const CONNECT_TIMEOUT_MS = 12_000;
const CONNECT_RETRIES = 2;

/**
 * Speech bitrates. Opus is very good at these rates for voice - the difference is
 * inaudible over a phone speaker - and every bit saved is TURN relay bandwidth that
 * a free allowance does not have to pay for.
 */
const BITRATE_DIRECT = 24_000;
const BITRATE_RELAYED = 16_000;

/**
 * Turn on Opus discontinuous transmission. Without it a mic sends full-rate frames
 * even while nobody is speaking, which is most of any conversation. Purely additive:
 * if the m-line does not look how we expect, the SDP is handed back untouched.
 */
function enableDtx(sdp) {
  try {
    if (!sdp || /usedtx=1/.test(sdp)) return sdp;
    const opus = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
    if (!opus) return sdp;

    const pt = opus[1];
    const fmtp = new RegExp('a=fmtp:' + pt + ' ([^\r\n]*)');
    if (fmtp.test(sdp)) {
      return sdp.replace(fmtp, (_match, params) => `a=fmtp:${pt} ${params};usedtx=1`);
    }
    // No Opus fmtp line yet - add one. SDP lines are CRLF terminated.
    const rtpmap = new RegExp('(a=rtpmap:' + pt + ' opus\/48000[^\r\n]*)');
    return sdp.replace(rtpmap, '$1\r\na=fmtp:' + pt + ' usedtx=1');
  } catch {
    return sdp;
  }
}

/** Cap what a peer connection will send. Cheap to call again when a route changes. */
async function capBitrate(pc, bps) {
  try {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = bps;
      await sender.setParameters(params);
    }
  } catch {
    /* an old browser without setParameters just runs uncapped */
  }
}

/** Build a local description with our Opus tweaks applied. */
async function describeLocal(pc) {
  const desc = pc.signalingState === 'have-remote-offer' ? await pc.createAnswer() : await pc.createOffer();
  desc.sdp = enableDtx(desc.sdp);
  await pc.setLocalDescription(desc);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useVoice({ iceServers, turnAvailable = false }) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [levels, setLevels] = useState({});
  const [peerStates, setPeerStates] = useState({});
  const [needsUnlock, setNeedsUnlock] = useState(false);
  /** 'team' is the franchise huddle, 'room' is everyone. Spectators are always 'room'. */
  const [channel, setChannel] = useState('team');
  /** Our own socket id, which is how we pick ourselves out of the broadcast roster. */
  const [selfId, setSelfId] = useState(null);
  /** socketId -> 'host' | 'srflx' | 'relay', so the UI can show how audio is travelling. */
  const [routes, setRoutes] = useState({});
  /** Set when a peer cannot be reached at all, with the likely reason. */
  const [reachability, setReachability] = useState(null);

  const localStream = useRef(null);
  /** socketId -> { pc, polite, makingOffer, ignoreOffer } */
  const peers = useRef(new Map());
  const audioEls = useRef(new Map());
  const pendingIce = useRef(new Map());
  const rescueTimers = useRef(new Map());
  const watchdogs = useRef(new Map());
  const audioCtx = useRef(null);
  const analysers = useRef(new Map());
  const rafRef = useRef(null);
  const joinedRef = useRef(false);
  const rejoiningRef = useRef(false);
  const channelRef = useRef('team');

  const config = useRef({
    iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    // Gather a candidate up front so the first offer is not waiting on the network.
    iceCandidatePoolSize: 1,
  });
  useEffect(() => {
    if (iceServers?.length) config.current = { ...config.current, iceServers };
  }, [iceServers]);

  const turnRef = useRef(turnAvailable);
  useEffect(() => {
    turnRef.current = turnAvailable;
  }, [turnAvailable]);

  /* ---------------- level metering ---------------- */

  const detachAnalyser = useCallback((key) => {
    const entry = analysers.current.get(key);
    if (!entry) return;
    for (const node of [entry.source, entry.analyser, entry.sink]) {
      try {
        node.disconnect();
      } catch {
        /* already torn down */
      }
    }
    analysers.current.delete(key);
  }, []);

  const attachAnalyser = useCallback(
    (key, stream) => {
      try {
        if (!stream.getAudioTracks().length) return;
        detachAnalyser(key);

        if (!audioCtx.current || audioCtx.current.state === 'closed') {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          audioCtx.current = new Ctx();
        }
        if (audioCtx.current.state === 'suspended') audioCtx.current.resume().catch(() => {});

        const source = audioCtx.current.createMediaStreamSource(stream);
        const analyser = audioCtx.current.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.7;

        // Chrome only pumps a graph that reaches the destination, so a remote stream
        // analysed in isolation reads silence forever. Route it through a muted gain
        // node: the meter gets data, the speakers get nothing extra.
        const sink = audioCtx.current.createGain();
        sink.gain.value = 0;

        source.connect(analyser);
        analyser.connect(sink);
        sink.connect(audioCtx.current.destination);

        analysers.current.set(key, {
          analyser,
          source,
          sink,
          data: new Uint8Array(analyser.frequencyBinCount),
        });
      } catch {
        /* metering is cosmetic - never break the call over it */
      }
    },
    [detachAnalyser],
  );

  useEffect(() => {
    if (!joined) return undefined;
    let last = 0;
    const tick = (ts) => {
      rafRef.current = requestAnimationFrame(tick);
      if (ts - last < 120) return; // ~8fps is plenty for a speaking ring
      last = ts;
      const next = {};
      for (const [key, { analyser, data }] of analysers.current) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        next[key] = Math.min(1, Math.sqrt(sum / data.length) * 6);
      }
      setLevels(next);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [joined]);

  /* ---------------- remote audio ---------------- */

  const playEl = useCallback((el) => {
    const attempt = el.play?.();
    if (attempt?.catch) {
      attempt.catch(() => {
        // Autoplay policy blocked us. Say so instead of looking connected but silent.
        setNeedsUnlock(true);
      });
    }
  }, []);

  const unlockAudio = useCallback(() => {
    audioCtx.current?.resume().catch(() => {});
    let blocked = false;
    for (const el of audioEls.current.values()) {
      const attempt = el.play?.();
      if (attempt?.catch) attempt.catch(() => { blocked = true; });
    }
    if (!blocked) setNeedsUnlock(false);
  }, []);

  /* ---------------- peer plumbing ---------------- */

  const clearRescue = useCallback((socketId) => {
    const timer = rescueTimers.current.get(socketId);
    if (timer) {
      clearTimeout(timer);
      rescueTimers.current.delete(socketId);
    }
  }, []);

  const closePeer = useCallback(
    (socketId) => {
      const entry = peers.current.get(socketId);
      if (entry) {
        const { pc } = entry;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        try {
          pc.close();
        } catch {
          /* noop */
        }
        peers.current.delete(socketId);
      }
      const el = audioEls.current.get(socketId);
      if (el) {
        el.srcObject = null;
        el.remove();
        audioEls.current.delete(socketId);
      }
      pendingIce.current.delete(socketId);
      clearRescue(socketId);
      const watchdog = watchdogs.current.get(socketId);
      if (watchdog) {
        clearTimeout(watchdog);
        watchdogs.current.delete(socketId);
      }
      detachAnalyser(socketId);
      setRoutes((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      setPeerStates((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    },
    [clearRescue, detachAnalyser],
  );

  /** How the audio actually travels, once a pair is chosen. 'relay' means via TURN. */
  const reportRoute = useCallback(async (socketId, pc) => {
    try {
      const stats = await pc.getStats();
      let pair = null;
      const candidates = new Map();
      stats.forEach((r) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates.set(r.id, r);
        if (r.type === 'candidate-pair' && (r.selected || r.state === 'succeeded')) {
          if (!pair || r.selected) pair = r;
        }
      });
      const local = pair && candidates.get(pair.localCandidateId);
      const remote = pair && candidates.get(pair.remoteCandidateId);
      const kind =
        local?.candidateType === 'relay' || remote?.candidateType === 'relay'
          ? 'relay'
          : local?.candidateType || null;
      if (kind) {
        setRoutes((prev) => (prev[socketId] === kind ? prev : { ...prev, [socketId]: kind }));
        // A relayed stream costs the TURN server bandwidth in both directions.
        capBitrate(pc, kind === 'relay' ? BITRATE_RELAYED : BITRATE_DIRECT);
      }
    } catch {
      /* diagnostics only */
    }
  }, []);

  const clearWatchdog = useCallback((socketId) => {
    const t = watchdogs.current.get(socketId);
    if (t) {
      clearTimeout(t);
      watchdogs.current.delete(socketId);
    }
  }, []);

  /**
   * A pair that never reaches 'connected' is usually two NATs with no path between
   * them - the normal case for two phones on mobile data. Retry with an ICE restart
   * a couple of times, then say plainly what is wrong instead of spinning forever.
   */
  const armWatchdog = useCallback(
    (socketId, entry) => {
      clearWatchdog(socketId);
      watchdogs.current.set(
        socketId,
        setTimeout(() => {
          watchdogs.current.delete(socketId);
          const { pc } = entry;
          if (!peers.current.has(socketId) || pc.connectionState === 'connected') return;

          entry.attempts = (entry.attempts || 0) + 1;
          if (entry.attempts <= CONNECT_RETRIES) {
            try {
              pc.restartIce?.();
            } catch {
              /* nothing more to try here */
            }
            armWatchdog(socketId, entry);
            return;
          }
          setReachability(
            turnRef.current
              ? 'Could not reach someone on the call. Their network may be blocking voice.'
              : 'Could not connect to everyone. On mobile data this needs a TURN relay server — bidding and chat are unaffected.',
          );
        }, CONNECT_TIMEOUT_MS),
      );
    },
    [clearWatchdog],
  );

  const createPeer = useCallback(
    (socketId) => {
      const existing = peers.current.get(socketId);
      if (existing) return existing;

      const socket = getSocket();
      const pc = new RTCPeerConnection(config.current);
      // Deterministic and opposite on both ends, which is all perfect negotiation needs.
      const entry = { pc, polite: String(socket.id) < String(socketId), makingOffer: false, ignoreOffer: false };
      peers.current.set(socketId, entry);
      clearRescue(socketId);

      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current));
      }

      pc.onnegotiationneeded = async () => {
        // Only drive a fresh offer from a settled connection; a negotiation that fires
        // mid-handshake is already being answered by the signal handler.
        if (pc.signalingState !== 'stable') return;
        try {
          entry.makingOffer = true;
          await describeLocal(pc);
          await capBitrate(pc, BITRATE_DIRECT);
          socket.emit('voice:signal', { to: socketId, data: { sdp: pc.localDescription } });
        } catch (err) {
          console.warn('[voice] negotiation failed', err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('voice:signal', { to: socketId, data: { candidate: e.candidate } });
      };

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        let el = audioEls.current.get(socketId);
        if (!el) {
          el = document.createElement('audio');
          el.autoplay = true;
          el.playsInline = true;
          el.dataset.peer = socketId;
          document.body.appendChild(el);
          audioEls.current.set(socketId, el);
        }
        el.srcObject = stream;
        playEl(el);
        attachAnalyser(socketId, stream);
      };

      pc.oniceconnectionstatechange = () => {
        // A blip drops us to 'failed'. Restart ICE instead of killing the peer for good.
        if (pc.iceConnectionState === 'failed') {
          try {
            if (pc.restartIce) pc.restartIce();
            else pc.createOffer({ iceRestart: true }).then((o) => pc.setLocalDescription(o));
          } catch {
            /* the connection state handler will clean up if this cannot recover */
          }
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => ({ ...prev, [socketId]: pc.connectionState }));
        if (pc.connectionState === 'connected') {
          entry.attempts = 0;
          clearWatchdog(socketId);
          setReachability(null);
          reportRoute(socketId, pc);
        }
        // 'failed' is handled by the ICE restart above; only a truly closed peer goes away.
        if (pc.connectionState === 'closed') closePeer(socketId);
      };

      armWatchdog(socketId, entry);
      return entry;
    },
    [armWatchdog, attachAnalyser, clearRescue, clearWatchdog, closePeer, playEl, reportRoute],
  );

  const flushIce = useCallback(async (socketId, pc) => {
    const queued = pendingIce.current.get(socketId) || [];
    pendingIce.current.delete(socketId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* stale candidate */
      }
    }
  }, []);

  const teardownMesh = useCallback(() => {
    for (const socketId of [...peers.current.keys()]) closePeer(socketId);
    for (const socketId of [...rescueTimers.current.keys()]) clearRescue(socketId);
  }, [clearRescue, closePeer]);

  /* ---------------- signalling ---------------- */

  useEffect(() => {
    const socket = getSocket();

    const onSignal = async ({ from, data }) => {
      if (!joinedRef.current) return;
      const entry = createPeer(from);
      const { pc } = entry;

      try {
        if (data.sdp) {
          const collision = data.sdp.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
          entry.ignoreOffer = !entry.polite && collision;
          if (entry.ignoreOffer) return; // the polite side will back down instead

          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushIce(from, pc);

          if (data.sdp.type === 'offer') {
            await describeLocal(pc);
            await capBitrate(pc, BITRATE_DIRECT);
            socket.emit('voice:signal', { to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription?.type) {
            await pc.addIceCandidate(data.candidate);
          } else {
            const list = pendingIce.current.get(from) || [];
            list.push(data.candidate);
            pendingIce.current.set(from, list);
          }
        }
      } catch (err) {
        if (!entry.ignoreOffer) console.warn('[voice] signal error', err);
      }
    };

    const onPeerJoined = ({ socketId }) => {
      if (!joinedRef.current || !socketId || peers.current.has(socketId)) return;
      // The newcomer normally offers. If their offer never lands, take over.
      clearRescue(socketId);
      rescueTimers.current.set(
        socketId,
        setTimeout(() => {
          rescueTimers.current.delete(socketId);
          if (joinedRef.current && !peers.current.has(socketId)) createPeer(socketId);
        }, OFFER_RESCUE_MS),
      );
    };

    const onPeerLeft = ({ socketId }) => closePeer(socketId);

    socket.on('voice:signal', onSignal);
    socket.on('voice:peer-joined', onPeerJoined);
    socket.on('voice:peer-left', onPeerLeft);
    return () => {
      socket.off('voice:signal', onSignal);
      socket.off('voice:peer-joined', onPeerJoined);
      socket.off('voice:peer-left', onPeerLeft);
    };
  }, [clearRescue, closePeer, createPeer, flushIce]);

  /* ---------------- join / rejoin ---------------- */

  /** Announce ourselves and open a connection to everyone on our channel. */
  const handshake = useCallback(async () => {
    const res = await emitAck('voice:join', { channel: channelRef.current });
    if (res.error) return res;
    // The server has the last word: a spectator with no table lands in the room channel.
    if (res.channel) {
      channelRef.current = res.channel;
      setChannel(res.channel);
    }
    setSelfId(getSocket().id || null);
    for (const peer of res.peers || []) createPeer(peer.socketId);
    return res;
  }, [createPeer]);

  /**
   * Move between the franchise huddle and the room channel. The mesh only ever spans
   * one channel, so this tears the old set of connections down and dials the new one.
   */
  const switchChannel = useCallback(
    async (next) => {
      const target = next === 'room' ? 'room' : 'team';
      if (target === channelRef.current) return;

      if (!joinedRef.current) {
        channelRef.current = target;
        setChannel(target);
        return;
      }

      const res = await emitAck('voice:channel', { channel: target });
      if (res.error) {
        setError(res.error);
        return;
      }
      teardownMesh();
      channelRef.current = res.channel;
      setChannel(res.channel);
      for (const peer of res.peers || []) createPeer(peer.socketId);
    },
    [createPeer, teardownMesh],
  );

  const join = useCallback(async (preferredChannel) => {
    if (joinedRef.current || connecting) return;
    if (preferredChannel === 'room' || preferredChannel === 'team') channelRef.current = preferredChannel;
    setError(null);

    if (!window.isSecureContext) {
      setError(
        'Your browser only allows the microphone over HTTPS or localhost. Serve the app over HTTPS (or a tunnel) to use voice on a phone.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support microphone capture.');
      return;
    }

    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStream.current = stream;
      attachAnalyser('me', stream);

      joinedRef.current = true; // signals may arrive the moment we announce ourselves
      const res = await handshake();
      if (res.error) {
        joinedRef.current = false;
        throw new Error(res.error);
      }
      setJoined(true);
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow it in your browser settings and try again.'
          : err.name === 'NotFoundError'
            ? 'No microphone found on this device.'
            : err.message || 'Could not start voice chat.';
      setError(msg);
      joinedRef.current = false;
      detachAnalyser('me');
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    } finally {
      setConnecting(false);
    }
  }, [attachAnalyser, connecting, detachAnalyser, handshake]);

  const leave = useCallback(() => {
    joinedRef.current = false;
    rejoiningRef.current = false;
    getSocket().emit('voice:leave');
    teardownMesh();
    detachAnalyser('me');
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    setJoined(false);
    setMuted(false);
    setLevels({});
    setPeerStates({});
    setNeedsUnlock(false);
    setError(null);
    setSelfId(null);
    setRoutes({});
    setReachability(null);
  }, [detachAnalyser, teardownMesh]);

  /**
   * A reconnect hands us a brand new socket id, so every peer id we hold is dead and
   * the server has already dropped us from the voice roster. Rebuild the whole mesh.
   */
  useEffect(() => {
    const socket = getSocket();

    const onConnect = async () => {
      if (!joinedRef.current || rejoiningRef.current) return;
      rejoiningRef.current = true;
      teardownMesh();

      // room:join has to land before the server will accept us back into voice, and
      // that is racing us on the same 'connect' event, so give it a few tries.
      try {
        for (let attempt = 0; attempt < REJOIN_ATTEMPTS; attempt += 1) {
          if (!joinedRef.current) return;
          const res = await handshake();
          if (!res.error) return;
          await sleep(REJOIN_DELAY_MS);
        }
        setError('Lost the voice connection. Tap the mic to rejoin.');
        joinedRef.current = false;
        setJoined(false);
      } finally {
        rejoiningRef.current = false;
      }
    };

    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [handshake, teardownMesh]);

  /**
   * A phone moving between wifi and mobile data gets a whole new local address, so
   * every gathered candidate is dead. The sockets reconnect on their own; the media
   * needs an ICE restart or the call stays up but silent.
   */
  useEffect(() => {
    if (!joined) return undefined;

    const restartAll = () => {
      for (const [socketId, entry] of peers.current) {
        if (entry.pc.connectionState === 'connected') continue;
        try {
          entry.pc.restartIce?.();
        } catch {
          /* nothing else to try */
        }
        entry.attempts = 0;
        armWatchdog(socketId, entry);
      }
    };

    // Mobile browsers suspend audio when the tab is hidden or the phone locks.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      audioCtx.current?.resume().catch(() => {});
      for (const el of audioEls.current.values()) el.play?.().catch(() => setNeedsUnlock(true));
      restartAll();
    };

    window.addEventListener('online', restartAll);
    document.addEventListener('visibilitychange', onVisible);
    const link = navigator.connection;
    link?.addEventListener?.('change', restartAll);

    return () => {
      window.removeEventListener('online', restartAll);
      document.removeEventListener('visibilitychange', onVisible);
      link?.removeEventListener?.('change', restartAll);
    };
  }, [joined, armWatchdog]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    audioCtx.current?.resume().catch(() => {});
    setMuted(next);
    getSocket().emit('voice:state', { muted: next });
  }, [muted]);

  useEffect(
    () => () => {
      joinedRef.current = false;
      for (const socketId of [...peers.current.keys()]) closePeer(socketId);
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      audioCtx.current?.close().catch(() => {});
      audioCtx.current = null; // a stale closed context silently kills every future meter
    },
    [closePeer],
  );

  return {
    joined,
    connecting,
    muted,
    error,
    levels,
    peerStates,
    needsUnlock,
    channel,
    selfId,
    routes,
    reachability,
    turnAvailable,
    join,
    leave,
    toggleMute,
    switchChannel,
    unlockAudio,
    setError,
  };
}
