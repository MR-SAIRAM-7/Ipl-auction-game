/**
 * Socket layer: room membership, auction commands, live chat and WebRTC voice signalling.
 * The server never trusts a client for money or timing - it only forwards intent.
 */
import { MAX_LOT_SEC, MIN_LOT_SEC, TEAM_COLORS, getRoom, loadRoom, persistRoom } from '../services/roomStore.js';
import { FORMATS } from '../data/formats.js';
import {
  MAX_MEMBERS_PER_TEAM,
  MAX_TEAMS_PER_ROOM,
  bidLimiter,
  chatLimiter,
  joinLimiter,
  signalLimiter,
} from '../utils/limits.js';
import {
  broadcastRoom,
  closeLot,
  disposeRoomTimers,
  finishAuction,
  submitTeamXI,
  maxAffordable,
  passLot,
  pauseRoom,
  placeBid,
  publicRoom,
  resetRoom,
  resumeRoom,
  startAuction,
} from '../services/auctionEngine.js';

/** roomCode -> Map<socketId, {playerId, name, teamId, color, muted, channel}> */
const voiceRooms = new Map();

/** How many people can sit at one franchise's table. */
const MAX_MEMBERS = MAX_MEMBERS_PER_TEAM;

/**
 * A member's playerId is the only credential its seat has, so it never leaves the
 * server. Everything the clients see is keyed by this opaque id instead.
 */
const newMemberId = () => `m_${Math.random().toString(36).slice(2, 10)}`;

/** Rooms persisted before franchises could hold more than one person. */
function migrateTeams(room) {
  room.teams.forEach((t) => {
    if (!Array.isArray(t.members) || !t.members.length) {
      t.members = [{ playerId: t.ownerId, name: t.ownerName, isOwner: true, connected: false }];
    }
    t.members.forEach((m) => {
      if (!m.id) m.id = newMemberId();
    });
  });
}

/** A franchise is "here" as long as anyone at its table still is. */
function syncTeamPresence(team) {
  team.connected = team.members.some((m) => m.connected);
}

const clean = (v, max = 24) => String(v ?? '').trim().slice(0, max);
const shortOf = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3) || 'TM';

function pickColor(room) {
  const used = new Set(room.teams.map((t) => t.color));
  const free = TEAM_COLORS.find((c) => !used.has(c.color));
  return (free || TEAM_COLORS[room.teams.length % TEAM_COLORS.length]).color;
}

function voiceRoster(code) {
  const map = voiceRooms.get(code);
  if (!map) return [];
  return [...map.entries()].map(([socketId, v]) => ({
    socketId,
    name: v.name,
    teamId: v.teamId,
    teamName: v.teamName,
    color: v.color,
    muted: v.muted,
    channel: v.channel,
  }));
}

/**
 * Which signalling group a participant belongs to. The mesh only ever connects
 * people inside the same group, so a franchise huddle genuinely cannot be heard
 * from the room channel - it is not a client-side mute.
 */
const voiceGroup = (code, entry) =>
  entry.channel === 'team' && entry.teamId
    ? `${code}:voice:team:${entry.teamId}`
    : `${code}:voice:room`;

/** Everyone the given participant should open a peer connection to. */
function voicePeers(code, socketId, entry) {
  const map = voiceRooms.get(code);
  if (!map) return [];
  const group = voiceGroup(code, entry);
  return [...map.entries()]
    .filter(([id, v]) => id !== socketId && voiceGroup(code, v) === group)
    .map(([id, v]) => ({ socketId: id, ...v }));
}

function leaveVoice(io, socket) {
  const code = socket.data?.code;
  if (!code) return;
  const map = voiceRooms.get(code);
  if (!map || !map.has(socket.id)) return;
  const entry = map.get(socket.id);
  const group = voiceGroup(code, entry);
  map.delete(socket.id);
  if (!map.size) voiceRooms.delete(code);
  socket.leave(group);
  io.to(group).emit('voice:peer-left', { socketId: socket.id });
  io.to(code).emit('voice:roster', voiceRoster(code));
}

export function registerSockets(io) {
  io.on('connection', (socket) => {
    /* ---------------- Room membership ---------------- */

    socket.on('room:join', async (payload = {}, ack) => {
      try {
        const code = clean(payload.code, 8).toUpperCase();
        const playerId = clean(payload.playerId, 40);
        const personName = clean(payload.name, 20) || 'Player';
        if (!code || !playerId) return ack?.({ error: 'Missing room code or player id.' });

        const budget = joinLimiter.take(socket.id);
        if (!budget.ok) return ack?.({ error: 'Too many join attempts. Wait a moment and try again.' });

        const room = getRoom(code) || (await loadRoom(code));
        if (!room) return ack?.({ error: `Room ${code} does not exist.` });

        socket.join(code);
        socket.data = { code, playerId, name: personName };

        migrateTeams(room);

        const seat = room.teams.find((t) => t.members.some((m) => m.playerId === playerId));
        const intent = payload.intent === 'new' || payload.intent === 'join' ? payload.intent : 'auto';

        // An explicit choice beats the seat we happen to remember. Without this, asking
        // for a new franchise from a browser that already holds one silently dropped you
        // back into the old table and renamed whoever was sitting there.
        if (seat && intent === 'new') {
          return ack?.({
            error: `You are already in this room as ${seat.name}.`,
            code: 'ALREADY_SEATED',
            teamName: seat.name,
          });
        }
        if (seat && intent === 'join' && seat.id !== clean(payload.joinTeamId, 20)) {
          return ack?.({
            error: `You are already in this room as ${seat.name}.`,
            code: 'ALREADY_SEATED',
            teamName: seat.name,
          });
        }

        let team = seat;
        let joinedAs = 'rejoined';

        if (!team && payload.joinTeamId) {
          const wanted = room.teams.find((t) => t.id === clean(payload.joinTeamId, 20));
          if (!wanted) return ack?.({ error: 'That franchise is no longer in the room.' });
          if (wanted.members.length >= MAX_MEMBERS) {
            return ack?.({ error: `${wanted.name} already has ${MAX_MEMBERS} people at the table.` });
          }
          // Joining an existing franchise shares its purse, so there is nothing to
          // gain by doing it late - teammates can arrive mid-auction.
          wanted.members.push({ id: newMemberId(), playerId, name: personName, isOwner: false, connected: true });
          team = wanted;
          joinedAs = 'member';
        }

        if (!team) {
          if (room.status !== 'lobby') {
            // A brand new franchise mid-auction would get a free purse, so watch instead.
            socket.data.spectator = true;
            ack?.({ ok: true, spectator: true, room: publicRoom(room) });
            io.to(code).emit('room:toast', { type: 'info', text: `${personName} is watching.` });
            return;
          }
          if (room.teams.length >= MAX_TEAMS_PER_ROOM) {
            return ack?.({ error: `This room is full (${MAX_TEAMS_PER_ROOM} franchises).` });
          }
          const teamName = clean(payload.teamName, 22) || `${personName}'s XI`;
          team = {
            id: `t_${Math.random().toString(36).slice(2, 10)}`,
            name: teamName,
            shortName: clean(payload.shortName, 3).toUpperCase() || shortOf(teamName),
            color: clean(payload.color, 7) || pickColor(room),
            ownerId: playerId,
            ownerName: personName,
            members: [{ id: newMemberId(), playerId, name: personName, isOwner: true, connected: true }],
            purse: room.settings.purse,
            squad: [],
            xi: null,
            connected: true,
            isHost: false,
          };
          room.teams.push(team);
          joinedAs = 'owner';
        }

        const me = team.members.find((m) => m.playerId === playerId);
        if (me) {
          me.name = personName;
          me.connected = true;
        }
        if (team.ownerId === playerId) team.ownerName = personName;
        syncTeamPresence(team);

        if (joinedAs === 'owner') {
          io.to(code).emit('room:toast', { type: 'success', text: `${team.name} joined the auction.` });
        } else if (joinedAs === 'member') {
          io.to(code).emit('room:toast', { type: 'success', text: `${personName} joined ${team.name}.` });
        }

        if (!room.hostId || !room.teams.some((t) => t.members.some((m) => m.playerId === room.hostId))) {
          room.hostId = playerId;
        }
        room.teams.forEach((t) => {
          t.isHost = t.members.some((m) => m.playerId === room.hostId);
        });

        socket.data.teamId = team.id;
        socket.data.memberId = me?.id || null;
        room.lastActivity = Date.now();
        if (room.paused) resumeRoom(io, room);

        ack?.({
          ok: true,
          teamId: team.id,
          memberId: me?.id || null,
          isHost: room.hostId === playerId,
          isOwner: team.ownerId === playerId,
          room: publicRoom(room),
        });
        broadcastRoom(io, room);
        io.to(code).emit('voice:roster', voiceRoster(code));
        persistRoom(room);
      } catch (err) {
        console.error('[socket] room:join failed', err);
        ack?.({ error: 'Could not join that room.' });
      }
    });

    /**
     * What the join screen needs before you commit: who is already in the room, and
     * whether this browser already holds a seat here. Deliberately returns no player
     * ids - those are the only credential a seat has.
     */
    socket.on('room:peek', async (payload = {}, ack) => {
      const code = clean(payload.code, 8).toUpperCase();
      const playerId = clean(payload.playerId, 40);
      if (!code) return ack?.({ error: 'Missing room code.' });

      const room = getRoom(code) || (await loadRoom(code));
      if (!room) return ack?.({ error: `Room ${code} does not exist.` });
      migrateTeams(room);

      const seat = playerId ? room.teams.find((t) => t.members.some((m) => m.playerId === playerId)) : null;
      return ack?.({
        ok: true,
        code: room.code,
        status: room.status,
        seatedTeamId: seat?.id || null,
        seatedTeamName: seat?.name || null,
        teams: room.teams.map((t) => ({
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          color: t.color,
          squadCount: t.squad?.length || 0,
          full: (t.members?.length || 0) >= MAX_MEMBERS,
          members: (t.members || []).map((m) => ({
            name: m.name,
            isOwner: Boolean(m.isOwner),
            connected: Boolean(m.connected),
          })),
        })),
      });
    });

    socket.on('room:update-team', (payload = {}, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room || room.status !== 'lobby') return ack?.({ error: 'You can only edit your team in the lobby.' });
      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      if (!team) return ack?.({ error: 'No team found.' });
      if (team.ownerId !== socket.data?.playerId) {
        return ack?.({ error: 'Only the franchise owner can rename or recolour the team.' });
      }
      if (payload.name) {
        team.name = clean(payload.name, 22);
        team.shortName = clean(payload.shortName, 3).toUpperCase() || shortOf(team.name);
      }
      if (payload.color) team.color = clean(payload.color, 7);
      broadcastRoom(io, room);
      persistRoom(room);
      return ack?.({ ok: true });
    });

    socket.on('room:settings', (payload = {}, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      if (room.hostId !== socket.data?.playerId) return ack?.({ error: 'Only the host can change settings.' });
      if (room.status !== 'lobby') return ack?.({ error: 'Settings are locked once the auction starts.' });

      const n = (v, min, max, fallback) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : fallback;
      };
      const s = room.settings;
      // The format drives the squad shape, the pool and the whole verdict, so it has
      // to be validated against the known list rather than taken on trust.
      if (payload.format && FORMATS[payload.format]) s.format = payload.format;
      s.purse = n(payload.purse, 10 * 100000, s.maxBid, s.purse);
      s.squadSize = n(payload.squadSize, 5, 25, s.squadSize);
      s.minSquad = n(payload.minSquad, 3, s.squadSize, Math.min(s.minSquad, s.squadSize));
      s.bidTimerSec = n(payload.bidTimerSec, MIN_LOT_SEC, MAX_LOT_SEC, s.bidTimerSec);
      s.poolSize = n(payload.poolSize, 15, 80, s.poolSize);
      room.teams.forEach((t) => {
        t.purse = s.purse;
      });
      broadcastRoom(io, room);
      persistRoom(room);
      return ack?.({ ok: true, settings: s });
    });

    /* ---------------- Auction commands ---------------- */

    socket.on('auction:start', async (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      if (room.hostId !== socket.data?.playerId) return ack?.({ error: 'Only the host can start the auction.' });
      ack?.({ ok: true });
      return startAuction(io, room);
    });

    socket.on('auction:bid', (payload = {}, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      if (!team) return ack?.({ error: 'You are spectating.' });
      if (!bidLimiter.take(socket.id).ok) return ack?.({ error: 'Slow down a moment.' });
      const result = placeBid(io, room, team, payload.amount, socket.data?.name, socket.data?.memberId);
      return ack?.(result);
    });

    socket.on('auction:pass', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      if (!team) return ack?.({ error: 'You are spectating.' });
      return ack?.(passLot(io, room, team));
    });

    socket.on('auction:skip', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      if (room.hostId !== socket.data?.playerId) return ack?.({ error: 'Only the host can skip a lot.' });
      closeLot(io, room, 'the host moved things along');
      return ack?.({ ok: true });
    });

    socket.on('auction:finish', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      if (room.hostId !== socket.data?.playerId) return ack?.({ error: 'Only the host can end the auction.' });
      ack?.({ ok: true });
      return finishAuction(io, room, 'The host ended the auction early.');
    });

    /** A franchise names the side it wants judged, once the auction has closed. */
    socket.on('auction:xi', (payload = {}, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      if (!team) return ack?.({ error: 'You are spectating.' });
      if (!bidLimiter.take(socket.id).ok) return ack?.({ error: 'Slow down a moment.' });
      const result = submitTeamXI(io, room, team, {
        xiIds: Array.isArray(payload.xiIds) ? payload.xiIds.slice(0, 20).map(String) : [],
        captainId: payload.captainId ? String(payload.captainId) : null,
        keeperId: payload.keeperId ? String(payload.keeperId) : null,
        impactId: payload.impactId ? String(payload.impactId) : null,
      });
      return ack?.(result.ok ? { ok: true } : { error: result.errors[0], errors: result.errors });
    });

    socket.on('auction:reset', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      if (room.hostId !== socket.data?.playerId) return ack?.({ error: 'Only the host can restart.' });
      resetRoom(io, room);
      return ack?.({ ok: true });
    });

    socket.on('room:state', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      if (!room) return ack?.({ error: 'Room not found.' });
      return ack?.({ ok: true, room: publicRoom(room) });
    });

    socket.on('room:purse-check', (_p, ack) => {
      const room = getRoom(socket.data?.code);
      const team = room?.teams.find((t) => t.id === socket.data?.teamId);
      if (!room || !team) return ack?.({ error: 'Not in a team.' });
      return ack?.({ ok: true, maxBid: maxAffordable(room, team) });
    });

    /* ---------------- Chat ---------------- */

    socket.on('chat:send', (payload = {}) => {
      const room = getRoom(socket.data?.code);
      if (!room) return;
      if (!chatLimiter.take(socket.id).ok) return;
      const text = clean(payload.text, 200);
      if (!text) return;
      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      const msg = {
        id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: socket.data?.name || 'Spectator',
        teamName: team?.name || null,
        color: team?.color || '#8a93a6',
        text,
        at: Date.now(),
      };
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.shift();
      io.to(room.code).emit('chat:new', msg);
    });

    /* ---------------- Voice (WebRTC signalling) ---------------- */

    socket.on('voice:join', (payload = {}, ack) => {
      const code = socket.data?.code;
      if (!code) return ack?.({ error: 'Join a room first.' });
      const room = getRoom(code);
      const team = room?.teams.find((t) => t.id === socket.data?.teamId);

      // Spectators have no table to huddle at, so they always land in the room channel.
      const channel = team && payload.channel !== 'room' ? 'team' : 'room';

      if (!voiceRooms.has(code)) voiceRooms.set(code, new Map());
      const map = voiceRooms.get(code);

      // A reconnect arrives on a brand new socket id while the old one may not have
      // been reaped yet. Drop the stale entry first, otherwise the roster shows the
      // same person twice and everyone tries to dial a socket that is already gone.
      for (const [staleId, entry] of [...map.entries()]) {
        if (staleId !== socket.id && entry.playerId === socket.data.playerId) {
          map.delete(staleId);
          io.to(voiceGroup(code, entry)).emit('voice:peer-left', { socketId: staleId });
        }
      }

      const entry = {
        playerId: socket.data.playerId,
        name: socket.data?.name || 'Spectator',
        teamId: team?.id || null,
        teamName: team?.name || null,
        color: team?.color || '#8a93a6',
        muted: false,
        channel,
      };
      const peers = voicePeers(code, socket.id, entry);

      map.set(socket.id, entry);
      socket.join(voiceGroup(code, entry));

      // The newcomer initiates the offers; existing peers just answer.
      socket.to(voiceGroup(code, entry)).emit('voice:peer-joined', { socketId: socket.id, ...entry });
      io.to(code).emit('voice:roster', voiceRoster(code));
      return ack?.({ ok: true, channel, peers });
    });

    /** Move between the franchise huddle and the room channel without leaving voice. */
    socket.on('voice:channel', (payload = {}, ack) => {
      const code = socket.data?.code;
      const map = voiceRooms.get(code);
      const entry = map?.get(socket.id);
      if (!entry) return ack?.({ error: 'You are not on the call.' });

      const next = entry.teamId && payload.channel !== 'room' ? 'team' : 'room';
      if (next === entry.channel) return ack?.({ ok: true, channel: next, peers: voicePeers(code, socket.id, entry) });

      const from = voiceGroup(code, entry);
      socket.leave(from);
      io.to(from).emit('voice:peer-left', { socketId: socket.id });

      entry.channel = next;
      const peers = voicePeers(code, socket.id, entry);
      const to = voiceGroup(code, entry);
      socket.join(to);
      socket.to(to).emit('voice:peer-joined', { socketId: socket.id, ...entry });
      io.to(code).emit('voice:roster', voiceRoster(code));
      return ack?.({ ok: true, channel: next, peers });
    });

    socket.on('voice:signal', (payload = {}) => {
      const { to, data } = payload;
      if (!to || !data) return;
      // ICE candidates come in bursts, so this ceiling is high - it only stops a flood.
      if (!signalLimiter.take(socket.id).ok) return;
      io.to(to).emit('voice:signal', { from: socket.id, data });
    });

    socket.on('voice:state', (payload = {}) => {
      const code = socket.data?.code;
      const map = voiceRooms.get(code);
      const entry = map?.get(socket.id);
      if (!entry) return;
      entry.muted = Boolean(payload.muted);
      io.to(code).emit('voice:roster', voiceRoster(code));
    });

    socket.on('voice:leave', () => leaveVoice(io, socket));

    /* ---------------- Disconnect ---------------- */

    socket.on('disconnect', () => {
      const code = socket.data?.code;
      [bidLimiter, chatLimiter, joinLimiter, signalLimiter].forEach((l) => l.forget(socket.id));
      leaveVoice(io, socket);
      if (!code) return;
      const room = getRoom(code);
      if (!room) return;

      const stillOpen = [...io.sockets.adapter.rooms.get(code) || []].some((id) => {
        const s = io.sockets.sockets.get(id);
        return s && s.id !== socket.id && s.data?.playerId === socket.data?.playerId;
      });
      if (stillOpen) return; // another tab of the same player is still connected

      const team = room.teams.find((t) => t.id === socket.data?.teamId);
      if (team) {
        const member = team.members?.find((m) => m.playerId === socket.data?.playerId);
        if (member) member.connected = false;
        syncTeamPresence(team);

        // In the lobby an empty table folds, but only once everyone has left it -
        // one person stepping away must not take their team-mates' franchise with them.
        const tableEmpty = !team.members?.some((m) => m.connected);
        if (room.status === 'lobby' && team.squad.length === 0 && tableEmpty) {
          room.teams = room.teams.filter((t) => t.id !== team.id);
        }
      }

      // Hand the host role on if whoever held it is no longer anywhere in the room.
      const hostStillHere = room.teams.some((t) =>
        t.members?.some((m) => m.playerId === room.hostId && m.connected),
      );
      if (!hostStillHere) {
        const heir = room.teams.flatMap((t) => t.members || []).find((m) => m.connected);
        room.hostId = heir?.playerId || room.teams[0]?.ownerId || null;
      }
      room.teams.forEach((t) => {
        t.isHost = t.members?.some((m) => m.playerId === room.hostId) || false;
      });

      if (!room.teams.some((t) => t.connected)) {
        pauseRoom(io, room);
        if (!room.teams.length) disposeRoomTimers(room.code);
      }

      broadcastRoom(io, room);
      io.to(code).emit('voice:roster', voiceRoster(code));
      persistRoom(room);
    });
  });
}
