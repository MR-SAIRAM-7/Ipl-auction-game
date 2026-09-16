import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { announce, announceLot, announceSold, announceUnsold, sfx, unlock } from '../lib/audio.js';
import { formatINR } from '../lib/format.js';
import { getSocket, emitAck } from '../lib/socket.js';
import { forkIdentity, getIdentity, rememberRoom, saveIdentity } from '../lib/identity.js';
import { getConfig } from '../lib/api.js';

/**
 * A safe shape for the context, so a component rendered for a moment outside the
 * provider (a hot reload, a stray mount) degrades instead of crashing the tree on
 * a destructure.
 */
const EMPTY_GAME = {
  identity: { playerId: null, name: '', teamName: '' },
  connected: false,
  room: null,
  me: { teamId: null, memberId: null, isHost: false, isOwner: false, spectator: false },
  myTeam: null,
  toasts: [],
  voiceRoster: [],
  evaluating: false,
  serverConfig: null,
  flash: null,
  pushToast: () => {},
};

const GameContext = createContext(EMPTY_GAME);
export const useGame = () => useContext(GameContext) || EMPTY_GAME;

let toastSeq = 0;

export function GameProvider({ children }) {
  const [identity, setIdentity] = useState(() => getIdentity());
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState({ teamId: null, memberId: null, isHost: false, isOwner: false, spectator: false });
  const [toasts, setToasts] = useState([]);
  const [voiceRoster, setVoiceRoster] = useState([]);
  const [evaluating, setEvaluating] = useState(false);
  const [serverConfig, setServerConfig] = useState(null);
  const [flash, setFlash] = useState(null); // short-lived bid animation payload

  const joinArgsRef = useRef(null);
  /**
   * The socket effect is mounted once, so it would close over the first `me`. Sound
   * cues need to know whether a bid was ours, which means reading the live value.
   */
  const meRef = useRef(me);
  meRef.current = me;

  const pushToast = useCallback((type, text) => {
    toastSeq += 1;
    const id = toastSeq;
    setToasts((list) => [...list.slice(-3), { id, type, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  useEffect(() => {
    getConfig()
      .then(setServerConfig)
      .catch(() => setServerConfig({ gemini: false, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
  }, []);

  /* ------------------------------------------------------------------ */
  /* Socket wiring                                                       */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Re-join automatically after a reconnect or a phone waking from sleep.
      if (joinArgsRef.current) {
        emitAck('room:join', joinArgsRef.current).then((res) => {
          if (res.room) {
            setRoom(res.room);
            setMe({
              teamId: res.teamId ?? null,
              memberId: res.memberId ?? null,
              isHost: Boolean(res.isHost),
              isOwner: Boolean(res.isOwner),
              spectator: Boolean(res.spectator),
            });
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);

    // The server no longer sends the upcoming players at all - only the lot on the
    // block and how far through each set the auction is.
    const onState = (next) => setRoom(() => next);

    const onLot = (lot) => {
      announceLot(lot.player, { marquee: lot.player?.set === 'marquee', setLabel: lot.player?.setLabel });
      setRoom((prev) => (prev ? { ...prev, lot, lotIndex: lot.index, status: 'auction' } : prev));
    };

    const onBid = (payload) => {
      setRoom((prev) => {
        if (!prev?.lot) return prev;
        return {
          ...prev,
          lot: {
            ...prev.lot,
            currentBid: payload.amount,
            bidderTeamId: payload.teamId,
            bidderTeamName: payload.teamName,
            byName: payload.byName,
            byMemberId: payload.byMemberId,
            endsAt: payload.endsAt,
            windowMs: payload.windowMs,
            // A bid ends any going-going countdown the passes had started.
            clockReason: null,
            nextBid: payload.nextBid,
            increment: payload.increment,
            passed: payload.passed || [],
          },
        };
      });
      if (payload.teamId === meRef.current?.teamId) sfx.bid();
      else sfx.outbid();
      setFlash({ key: `${payload.teamId}-${payload.amount}`, ...payload });
    };

    const onPass = (payload) =>
      setRoom((prev) => (prev?.lot ? { ...prev, lot: { ...prev.lot, passed: payload.passed || [] } } : prev));

    // The server shortens the clock when every rival has passed.
    const onClock = ({ endsAt, windowMs, reason }) =>
      setRoom((prev) =>
        prev?.lot ? { ...prev, lot: { ...prev.lot, endsAt, windowMs, clockReason: reason } } : prev,
      );

    const onClosed = ({ sale, teams }) => {
      if (sale.status === 'sold') announceSold(sale.player, sale.teamName, formatINR(sale.amount));
      else announceUnsold(sale.player);
      setRoom((prev) => {
        if (!prev) return prev;
        const purses = new Map(teams.map((t) => [t.id, t.purse]));
        return {
          ...prev,
          lot: prev.lot ? { ...prev.lot, status: sale.status } : prev.lot,
          history: [...(prev.history || []), sale].slice(-60),
          teams: prev.teams.map((t) => {
            const purse = purses.has(t.id) ? purses.get(t.id) : t.purse;
            if (sale.status === 'sold' && sale.teamId === t.id) {
              return { ...t, purse, squad: [...t.squad, sale.player] };
            }
            return { ...t, purse };
          }),
        };
      });
      setFlash(null);
    };

    const onCommentary = (line) => {
      // The sale announcement has just played, so let it finish rather than cutting
      // it off with the colour commentary that follows.
      setTimeout(() => announce(line, { interrupt: false, rate: 1.06 }), 2200);
      setRoom((prev) => (prev ? { ...prev, commentary: [...(prev.commentary || []), line].slice(-12) } : prev));
    };

    const onSelecting = ({ endsAt, seconds }) => {
      sfx.finish();
      setRoom((prev) => (prev ? { ...prev, status: 'selecting', selectionEndsAt: endsAt, lot: null } : prev));
      pushToast('info', `Auction over. Name your XI - ${seconds} seconds.`);
    };

    const onEvaluating = () => setEvaluating(true);

    const onFinished = ({ result, teams }) => {
      setEvaluating(false);
      setRoom((prev) => (prev ? { ...prev, status: 'finished', result, teams, lot: null } : prev));
    };

    const onChat = (msg) =>
      setRoom((prev) => (prev ? { ...prev, chat: [...(prev.chat || []), msg].slice(-80) } : prev));

    const onToast = ({ type, text }) => pushToast(type, text);
    const onPaused = ({ paused }) => setRoom((prev) => (prev ? { ...prev, paused } : prev));
    const onRoster = (list) => setVoiceRoster(list || []);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('auction:lot', onLot);
    socket.on('auction:bid', onBid);
    socket.on('auction:pass', onPass);
    socket.on('auction:clock', onClock);
    socket.on('auction:closed', onClosed);
    socket.on('auction:commentary', onCommentary);
    socket.on('auction:selecting', onSelecting);
    socket.on('auction:evaluating', onEvaluating);
    socket.on('auction:finished', onFinished);
    socket.on('chat:new', onChat);
    socket.on('room:toast', onToast);
    socket.on('room:paused', onPaused);
    socket.on('voice:roster', onRoster);

    if (socket.connected) setConnected(true);

    // Browsers will not start audio until the page has been interacted with, so the
    // first genuine tap anywhere is what enables the auctioneer.
    const onFirstGesture = () => unlock();
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('auction:lot', onLot);
      socket.off('auction:bid', onBid);
      socket.off('auction:pass', onPass);
      socket.off('auction:clock', onClock);
      socket.off('auction:closed', onClosed);
      socket.off('auction:commentary', onCommentary);
      socket.off('auction:selecting', onSelecting);
      socket.off('auction:evaluating', onEvaluating);
      socket.off('auction:finished', onFinished);
      socket.off('chat:new', onChat);
      socket.off('room:toast', onToast);
      socket.off('room:paused', onPaused);
      socket.off('voice:roster', onRoster);
    };
  }, [pushToast]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  const join = useCallback(
    async ({ code, name, teamName, joinTeamId, intent = 'auto' }) => {
      let id = saveIdentity({ name, teamName });
      const upper = code.toUpperCase();

      const attempt = (playerId) =>
        emitAck('room:join', { code: upper, playerId, name, teamName, joinTeamId, intent });

      let res = await attempt(id.playerId);

      // Deliberately picking a franchise while this browser already holds a seat in the
      // room means you want to be a second person at the table - whether that is a brand
      // new franchise or an existing one - so become one, for the life of this tab.
      if (res.code === 'ALREADY_SEATED' && (intent === 'new' || intent === 'join')) {
        id = forkIdentity();
        setIdentity(id);
        res = await attempt(id.playerId);
      }

      if (res.error) {
        joinArgsRef.current = null;
        return res;
      }

      // Reconnects must never re-run the original intent, or the server would treat a
      // dropped connection as a second request for a franchise we already have.
      joinArgsRef.current = { code: upper, playerId: id.playerId, name, teamName, intent: 'auto' };

      setIdentity(id);
      rememberRoom(upper);
      setRoom(res.room);
      setMe({
        teamId: res.teamId ?? null,
        memberId: res.memberId ?? null,
        isHost: Boolean(res.isHost),
        isOwner: Boolean(res.isOwner),
        spectator: Boolean(res.spectator),
      });
      return res;
    },
    [],
  );

  const leave = useCallback(() => {
    joinArgsRef.current = null;
    setRoom(null);
    setMe({ teamId: null, memberId: null, isHost: false, isOwner: false, spectator: false });
    setVoiceRoster([]);
    getSocket().emit('voice:leave');
  }, []);

  const bid = useCallback(
    async (amount) => {
      const res = await emitAck('auction:bid', { amount });
      if (res.error) pushToast('error', res.error);
      return res;
    },
    [pushToast],
  );

  const pass = useCallback(async () => {
    const res = await emitAck('auction:pass', {});
    if (res.error) pushToast('error', res.error);
    return res;
  }, [pushToast]);

  const start = useCallback(async () => {
    const res = await emitAck('auction:start', {});
    if (res.error) pushToast('error', res.error);
    return res;
  }, [pushToast]);

  const skipLot = useCallback(async () => {
    const res = await emitAck('auction:skip', {});
    if (res.error) pushToast('error', res.error);
    return res;
  }, [pushToast]);

  const finish = useCallback(async () => {
    const res = await emitAck('auction:finish', {});
    if (res.error) pushToast('error', res.error);
    return res;
  }, [pushToast]);

  /** Submit the side this franchise wants judged. Errors come back as a checklist. */
  const submitXI = useCallback(
    async (selection) => {
      const res = await emitAck('auction:xi', selection);
      if (res.error) pushToast('error', res.error);
      return res;
    },
    [pushToast],
  );

  const reset = useCallback(async () => {
    const res = await emitAck('auction:reset', {});
    if (res.error) pushToast('error', res.error);
    return res;
  }, [pushToast]);

  const updateSettings = useCallback(
    async (settings) => {
      const res = await emitAck('room:settings', settings);
      if (res.error) pushToast('error', res.error);
      return res;
    },
    [pushToast],
  );

  const updateTeam = useCallback(
    async (payload) => {
      const res = await emitAck('room:update-team', payload);
      if (res.error) pushToast('error', res.error);
      else saveIdentity({ teamName: payload.name });
      return res;
    },
    [pushToast],
  );

  const sendChat = useCallback((text) => getSocket().emit('chat:send', { text }), []);

  const myTeam = useMemo(
    () => room?.teams?.find((t) => t.id === me.teamId) || null,
    [room, me.teamId],
  );

  const value = useMemo(
    () => ({
      identity,
      connected,
      room,
      me,
      myTeam,
      toasts,
      pushToast,
      voiceRoster,
      evaluating,
      serverConfig,
      flash,
      join,
      leave,
      bid,
      pass,
      start,
      skipLot,
      finish,
      submitXI,
      reset,
      updateSettings,
      updateTeam,
      sendChat,
    }),
    [
      identity, connected, room, me, myTeam, toasts, pushToast, voiceRoster, evaluating,
      serverConfig, flash, join, leave, bid, pass, start, skipLot, finish, submitXI, reset, updateSettings,
      updateTeam, sendChat,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
