/**
 * Rooms live in memory while a game is being played (the auction clock needs that),
 * and are mirrored into MongoDB so a server restart or a page refresh can recover them.
 */
import { RoomModel } from '../models/Room.js';
import { dbReady } from '../config/db.js';
import { DEFAULT_PURSE, MAX_BID } from '../utils/money.js';
import { DEFAULT_FORMAT, getFormat } from '../data/formats.js';

/**
 * Every player gets a proper spell on the block: one to three minutes.
 * These live here because defaultSettings is the single source of truth for a
 * room's rules - the auction engine imports them rather than the other way round.
 */
export const MIN_LOT_SEC = 60;
export const MAX_LOT_SEC = 180;
export const DEFAULT_LOT_SEC = 90;

const rooms = new Map();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Muted franchise colours - readable as a small block of colour on a white page. */
export const TEAM_COLORS = [
  { name: 'Royal Blue', color: '#2f6fed' },
  { name: 'Sunrise Orange', color: '#dd6b2b' },
  { name: 'Chennai Gold', color: '#d9a212' },
  { name: 'Kolkata Purple', color: '#7c4dcc' },
  { name: 'Bangalore Red', color: '#cf3b33' },
  { name: 'Punjab Crimson', color: '#c0407a' },
  { name: 'Rajasthan Pink', color: '#e07aa6' },
  { name: 'Delhi Navy', color: '#22508f' },
  { name: 'Lucknow Teal', color: '#0f9488' },
  { name: 'Gujarat Slate', color: '#5a6472' },
];

export function defaultSettings(overrides = {}) {
  // The format decides the squad shape, so resolve it before the other defaults and
  // let it supply them - an explicit override still wins over the format's suggestion.
  const formatId = getFormat(overrides.format).id;
  const format = getFormat(formatId);
  return {
    format: formatId,
    purse: DEFAULT_PURSE,
    squadSize: format.defaultSquadSize,
    minSquad: format.defaultMinSquad,
    bidTimerSec: DEFAULT_LOT_SEC,
    poolSize: 40,
    maxBid: MAX_BID,
    ...overrides,
    // Never let a stale or tampered value through, whatever the overrides said.
    format: formatId,
  };
}

export function newRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom({ hostId, settings } = {}) {
  const room = {
    code: newRoomCode(),
    hostId: hostId || null,
    status: 'lobby',
    settings: defaultSettings(settings),
    theme: null,
    poolSource: null,
    teams: [],
    pool: [],
    lotIndex: -1,
    lot: null,
    history: [],
    unsoldQueue: [],
    secondRoundDone: false,
    result: null,
    chat: [],
    commentary: [],
    createdAt: new Date(),
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase()) || null;
}

export function allRooms() {
  return [...rooms.values()];
}

export function roomCount() {
  return rooms.size;
}

export function deleteRoom(code) {
  rooms.delete(code);
}

/** Rehydrate a room from Mongo after a server restart. */
export async function loadRoom(code) {
  const key = String(code || '').toUpperCase();
  if (rooms.has(key)) return rooms.get(key);
  if (!dbReady()) return null;
  const doc = await RoomModel.findOne({ code: key }).lean();
  if (!doc) return null;
  const room = {
    code: doc.code,
    hostId: doc.hostId,
    status: doc.status === 'auction' ? 'lobby' : doc.status, // a restart always drops back to the lobby
    settings: defaultSettings(doc.settings || {}),
    theme: doc.theme,
    poolSource: doc.poolSource,
    teams: (doc.teams || []).map((t) => ({
      ...t,
      xi: t.xi || null,
      connected: false,
      // Nobody is at any table until they reconnect.
      members: (t.members?.length ? t.members : [{ playerId: t.ownerId, name: t.ownerName, isOwner: true }]).map(
        (m) => ({ ...m, connected: false }),
      ),
    })),
    pool: doc.pool || [],
    lotIndex: doc.lotIndex ?? -1,
    lot: null,
    history: doc.history || [],
    unsoldQueue: doc.unsoldQueue || [],
    secondRoundDone: Boolean(doc.secondRoundDone),
    result: doc.result || null,
    chat: [],
    commentary: [],
    createdAt: doc.createdAt || new Date(),
  };
  rooms.set(room.code, room);
  return room;
}

let persistQueue = Promise.resolve();

/** Fire-and-forget snapshot. Serialised so two writes never race on the same doc. */
export function persistRoom(room) {
  if (!dbReady() || !room) return;
  const snapshot = {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    settings: room.settings,
    theme: room.theme,
    poolSource: room.poolSource,
    teams: room.teams.map(
      ({ id, name, shortName, color, ownerId, ownerName, members, purse, squad, connected, isHost, xi }) => ({
        id, name, shortName, color, ownerId, ownerName, members, purse, squad, connected, isHost, xi,
      }),
    ),
    pool: room.pool,
    lotIndex: room.lotIndex,
    history: room.history,
    unsoldQueue: room.unsoldQueue,
    secondRoundDone: room.secondRoundDone,
    result: room.result,
    finishedAt: room.status === 'finished' ? new Date() : undefined,
  };
  persistQueue = persistQueue
    .then(() => RoomModel.updateOne({ code: room.code }, { $set: snapshot }, { upsert: true }))
    .catch((err) => console.warn('[db] persist failed:', err.message));
}

/** Drop rooms nobody has touched in a while so long-running servers do not leak. */
export function sweepIdleRooms(maxAgeMs = 6 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.teams.some((t) => t.connected);
    const age = now - new Date(room.lastActivity || room.createdAt).getTime();
    if (!anyConnected && age > maxAgeMs) rooms.delete(code);
  }
}
