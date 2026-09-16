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
import { iceServers } from '../config/ice.js';
import { MAX_ROOMS, createRoomLimiter } from '../utils/limits.js';
import { roomCount } from '../services/roomStore.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbReady(), gemini: geminiEnabled() });
});

router.get('/config', async (_req, res) => {
  // Cloudflare credentials are minted on demand, so this can await; it never throws.
  const servers = await iceServers();
  res.json({
    gemini: geminiEnabled(),
    db: dbReady(),
    iceServers: servers,
    // Whether a relay is actually usable, not merely configured, so the client can
    // explain a failed call instead of just shrugging at it.
    turn: servers.length > 1,
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
