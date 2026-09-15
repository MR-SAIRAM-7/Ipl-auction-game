import { Router } from 'express';
import {
  DEFAULT_LOT_SEC,
  MAX_LOT_SEC,
  MIN_LOT_SEC,
  createRoom,
  defaultSettings,
  getRoom,
  loadRoom,
} from '../services/roomStore.js';
import { publicRoom } from '../services/auctionEngine.js';
import { geminiEnabled } from '../services/gemini.js';
import { DEFAULT_PURSE, MAX_BID } from '../utils/money.js';
import { dbReady } from '../config/db.js';
import { MAX_ROOMS, createRoomLimiter } from '../utils/limits.js';
import { roomCount } from '../services/roomStore.js';

const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
];

const turnUrls = () =>
  (process.env.TURN_URLS || process.env.TURN_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** A TURN server is only usable if it has credentials to go with it. */
export const turnConfigured = () =>
  turnUrls().length > 0 && Boolean(process.env.TURN_USERNAME) && Boolean(process.env.TURN_CREDENTIAL);

/**
 * STUN only tells a peer its own public address. That is enough when at least one
 * side sits behind a permissive NAT, which is typical on home wifi.
 *
 * Mobile carriers use CGNAT, which is symmetric: the port a peer sees is not the
 * port anyone else can reach. Two phones on mobile data therefore have no direct
 * path at all, and only a TURN server - which relays the audio - will connect them.
 * Set TURN_URLS (comma separated, ideally a udp, a tcp and a turns:443 entry) plus
 * TURN_USERNAME and TURN_CREDENTIAL if people will play off wifi.
 */
export const iceServers = () => {
  const servers = [{ urls: STUN }];
  if (turnConfigured()) {
    servers.push({
      urls: turnUrls(),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
};

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbReady(), gemini: geminiEnabled() });
});

router.get('/config', (_req, res) => {
  res.json({
    gemini: geminiEnabled(),
    db: dbReady(),
    iceServers: iceServers(),
    // Lets the client explain a failed call instead of just shrugging at it.
    turn: turnConfigured(),
    maxBid: MAX_BID,
    defaultPurse: DEFAULT_PURSE,
    defaults: defaultSettings(),
  });
});

router.post('/rooms', (req, res) => {
  const budget = createRoomLimiter.take(req.ip || 'unknown');
  if (!budget.ok) {
    res.set('Retry-After', String(Math.ceil(budget.retryInMs / 1000)));
    return res.status(429).json({ error: 'Too many rooms created. Try again in a minute.' });
  }
  if (roomCount() >= MAX_ROOMS) {
    return res.status(503).json({ error: 'The server is at capacity. Try again shortly.' });
  }

  const { hostId, settings } = req.body || {};
  const clean = {};
  if (settings) {
    const n = (v, min, max, fallback) => {
      const x = Number(v);
      return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : fallback;
    };
    clean.purse = n(settings.purse, 10 * 100000, MAX_BID, DEFAULT_PURSE);
    clean.squadSize = n(settings.squadSize, 5, 25, 15);
    clean.minSquad = n(settings.minSquad, 3, clean.squadSize, Math.min(11, clean.squadSize));
    clean.bidTimerSec = n(settings.bidTimerSec, MIN_LOT_SEC, MAX_LOT_SEC, DEFAULT_LOT_SEC);
    clean.poolSize = n(settings.poolSize, 15, 80, 40);
  }
  const room = createRoom({ hostId, settings: clean });
  return res.status(201).json({ code: room.code, settings: room.settings });
});

router.get('/rooms/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = getRoom(code) || (await loadRoom(code));
  if (!room) return res.status(404).json({ error: 'Room not found' });
  // The join screen uses this to offer the franchises already in the room.
  return res.json({
    code: room.code,
    status: room.status,
    teamCount: room.teams.length,
    settings: room.settings,
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      squadCount: t.squad?.length || 0,
      members: (t.members?.length ? t.members : [{ name: t.ownerName, isOwner: true }]).map((m) => ({
        name: m.name,
        isOwner: Boolean(m.isOwner),
        connected: Boolean(m.connected),
      })),
    })),
  });
});

router.get('/rooms/:code/state', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = getRoom(code) || (await loadRoom(code));
  if (!room) return res.status(404).json({ error: 'Room not found' });
  return res.json(publicRoom(room));
});

export default router;
