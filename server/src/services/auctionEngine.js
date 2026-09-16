/**
 * The authoritative auction clock and rule engine.
 * Every price, timer and purse change happens here - clients only ever render what
 * this module broadcasts, so a tampered client cannot invent a bid.
 */
import { MAX_BID, bidIncrement, nextBidAmount } from '../utils/money.js';
import { auctioneerLine, evaluateAuction, generatePlayerPool } from './gemini.js';
import { autoPickXI, validateXI } from './playingXI.js';
import { getFormat } from '../data/formats.js';
import { MAX_LOT_SEC, MIN_LOT_SEC, DEFAULT_LOT_SEC, persistRoom } from './roomStore.js';

const MIN_BASE = 20_000;
const BREAK_MS = 3500;

/** A late bid always buys everyone at least this much time back. */
const BID_RESET_FLOOR_MS = 20_000;

/** Once every rival has passed, the hammer hangs for a few seconds, not a full minute. */
const PASS_CLOSE_MS = 6000;

/** Nobody can meet the base price - move on quickly rather than burn the clock. */
const NO_INTEREST_MS = 2500;

const timers = new Map();

/** Clamps a room's lot length, so a stale room or a tampered payload can never go below a minute. */
export const lotSeconds = (room) =>
  Math.min(MAX_LOT_SEC, Math.max(MIN_LOT_SEC, Number(room.settings?.bidTimerSec) || DEFAULT_LOT_SEC));

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * What every client is allowed to see about a franchise. Player ids are the only
 * credential a seat has, so neither they nor ownerId ever go over the wire - members
 * carry an opaque id and the roles they actually need.
 */
export const publicTeam = (t, hostId) => ({
  id: t.id,
  name: t.name,
  shortName: t.shortName,
  color: t.color,
  ownerName: t.ownerName,
  members: (t.members || []).map((m) => ({
    id: m.id,
    name: m.name,
    isOwner: Boolean(m.isOwner),
    isHost: Boolean(hostId) && m.playerId === hostId,
    connected: Boolean(m.connected),
  })),
  purse: t.purse,
  squad: t.squad,
  // Whether this franchise has named a side, but never WHICH side - the selection is
  // the one thing in the game worth hiding from a rival until the verdict.
  xiSubmitted: Boolean(t.xi && !t.xi.auto),
  connected: t.connected,
  isHost: t.isHost,
});

export function publicLot(room) {
  if (!room.lot) return null;
  const { player, currentBid, bidderTeamId, bidderTeamName, byName, byMemberId, endsAt, windowMs, passed, status, round } =
    room.lot;
  return {
    player,
    currentBid,
    bidderTeamId,
    bidderTeamName,
    byName,
    byMemberId,
    endsAt,
    // How long the current countdown window is, so the client's progress bar stays
    // honest after a bid tops the clock up or a round of passes cuts it short.
    windowMs,
    passed,
    status,
    round,
    nextBid: nextBidAmount(currentBid, Boolean(bidderTeamId)),
    increment: bidIncrement(currentBid),
    index: room.lotIndex,
    total: room.pool.length,
  };
}

export function publicRoom(room, { includePool = true } = {}) {
  return {
    code: room.code,
    status: room.status,
    settings: room.settings,
    theme: room.theme,
    poolSource: room.poolSource,
    teams: room.teams.map((t) => publicTeam(t, room.hostId)),
    lot: publicLot(room),
    lotIndex: room.lotIndex,
    poolSize: room.pool.length,
    /**
     * The upcoming players are deliberately NOT sent. Knowing who is still to come
     * removes the whole point of bidding under pressure, and stripping them from the
     * payload is the only way to stop a curious player reading them out of devtools.
     * What a real auction does announce is the set, so that is what goes instead.
     */
    sets: setProgress(room),
    // When the XI selection window shuts, so every client runs the same countdown.
    selectionEndsAt: room.selectionEndsAt ?? null,
    history: room.history.slice(-40),
    unsoldCount: room.unsoldQueue.length,
    secondRoundDone: room.secondRoundDone,
    result: room.result,
    paused: Boolean(room.paused),
    chat: room.chat.slice(-50),
    commentary: room.commentary.slice(-12),
  };
}

/**
 * Where the auction has got to, set by set: how many lots each set holds and how many
 * are already gone. Enough to plan a purse around, nothing that spoils a lot.
 */
function setProgress(room) {
  const seen = new Map();
  room.pool.forEach((p, i) => {
    const key = p.setLabel || 'Players';
    if (!seen.has(key)) seen.set(key, { label: key, total: 0, done: 0 });
    const entry = seen.get(key);
    entry.total += 1;
    if (i <= room.lotIndex) entry.done += 1;
  });
  return [...seen.values()];
}

export function broadcastRoom(io, room, opts) {
  io.to(room.code).emit('room:state', publicRoom(room, opts));
}

const toast = (io, room, type, text) => io.to(room.code).emit('room:toast', { type, text });

/* ------------------------------------------------------------------ */
/* Money rules                                                         */
/* ------------------------------------------------------------------ */

/**
 * A team must always keep back enough money to reach the minimum squad size,
 * otherwise one silly bid can leave it unable to field a side.
 */
export function maxAffordable(room, team) {
  const slotsAfterThis = Math.max(0, room.settings.minSquad - team.squad.length - 1);
  const reserve = slotsAfterThis * MIN_BASE;
  return Math.max(0, Math.min(team.purse - reserve, room.settings.maxBid ?? MAX_BID));
}

export function teamHasSpace(room, team) {
  return team.squad.length < room.settings.squadSize;
}

export function canTeamBid(room, team, amount) {
  if (!teamHasSpace(room, team)) return false;
  return maxAffordable(room, team) >= amount;
}

const activeTeams = (room) => room.teams.filter((t) => teamHasSpace(room, t));

/* ------------------------------------------------------------------ */
/* Timers                                                              */
/* ------------------------------------------------------------------ */

function clearRoomTimer(code) {
  const t = timers.get(code);
  if (t) {
    clearTimeout(t);
    timers.delete(code);
  }
}

function schedule(code, ms, fn) {
  clearRoomTimer(code);
  timers.set(code, setTimeout(fn, Math.max(0, ms)));
}

export function disposeRoomTimers(code) {
  clearRoomTimer(code);
}

/* ------------------------------------------------------------------ */
/* Auction lifecycle                                                   */
/* ------------------------------------------------------------------ */

export async function startAuction(io, room) {
  if (room.status === 'auction') return;
  if (room.teams.length < 1) {
    toast(io, room, 'error', 'Need at least one team to start.');
    return;
  }

  // Normalise the clock once, up front, so the lobby, the client and the timers agree.
  room.settings.bidTimerSec = lotSeconds(room);

  room.status = 'generating';
  room.result = null;
  room.history = [];
  room.unsoldQueue = [];
  room.secondRoundDone = false;
  room.lotIndex = -1;
  room.lot = null;
  room.commentary = [];
  room.teams.forEach((t) => {
    t.purse = room.settings.purse;
    t.squad = [];
  });
  broadcastRoom(io, room, { includePool: false });

  const { players, source, theme } = await generatePlayerPool({
    count: room.settings.poolSize,
    format: room.settings.format,
  });
  room.pool = players.map((p) => ({ ...p, round: 1 }));
  room.poolSource = source;
  room.theme = theme;
  room.status = 'auction';
  room.lastActivity = Date.now();

  broadcastRoom(io, room);
  toast(
    io,
    room,
    'info',
    source === 'gemini'
      ? `Gemini scouted ${players.length} players for this season.`
      : `Generated ${players.length} players locally (no Gemini key set).`,
  );
  persistRoom(room);

  schedule(room.code, 1200, () => openNextLot(io, room));
}

export function openNextLot(io, room) {
  if (room.status !== 'auction') return;

  if (!activeTeams(room).length) {
    finishAuction(io, room, 'Every squad is full.');
    return;
  }

  room.lotIndex += 1;

  if (room.lotIndex >= room.pool.length) {
    const canRetry = room.unsoldQueue.length > 0 && !room.secondRoundDone;
    if (canRetry) {
      startUnsoldRound(io, room);
      return;
    }
    finishAuction(io, room, 'Every player has gone under the hammer.');
    return;
  }

  const player = room.pool[room.lotIndex];
  const affordableBy = activeTeams(room).filter((t) => maxAffordable(room, t) >= player.basePrice);
  const windowMs = lotSeconds(room) * 1000;

  room.lot = {
    player,
    currentBid: player.basePrice,
    bidderTeamId: null,
    bidderTeamName: null,
    endsAt: Date.now() + windowMs,
    windowMs,
    passed: [],
    status: 'live',
    round: player.round || 1,
    startedAt: Date.now(),
  };

  if (!affordableBy.length) {
    room.lot.endsAt = Date.now() + NO_INTEREST_MS;
    room.lot.windowMs = NO_INTEREST_MS;
    io.to(room.code).emit('auction:lot', publicLot(room));
    schedule(room.code, NO_INTEREST_MS, () => closeLot(io, room, 'nobody could meet the base price'));
    return;
  }

  io.to(room.code).emit('auction:lot', publicLot(room));
  schedule(room.code, windowMs, () => closeLot(io, room));
}

function startUnsoldRound(io, room) {
  room.secondRoundDone = true;
  const retry = room.unsoldQueue.map((p) => ({
    ...p,
    round: 2,
    basePrice: Math.max(MIN_BASE, Math.round((p.basePrice / 2) / 10_000) * 10_000),
  }));
  room.unsoldQueue = [];
  room.pool = [...room.pool, ...retry];
  room.lotIndex -= 1; // openNextLot will step forward onto the first retry lot
  broadcastRoom(io, room);
  toast(io, room, 'info', `Unsold round: ${retry.length} players return at half their base price.`);
  persistRoom(room);
  schedule(room.code, 2000, () => openNextLot(io, room));
}

export function placeBid(io, room, team, requestedAmount, byName, byMemberId) {
  const lot = room.lot;
  if (room.status !== 'auction' || !lot || lot.status !== 'live') {
    return { error: 'No live lot right now.' };
  }
  if (room.paused) return { error: 'The auction is paused.' };
  if (lot.bidderTeamId === team.id) return { error: 'You already hold the highest bid.' };
  if (!teamHasSpace(room, team)) return { error: 'Your squad is full.' };

  const minimum = nextBidAmount(lot.currentBid, Boolean(lot.bidderTeamId));
  let amount = Number(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) amount = minimum;
  amount = Math.round(amount / 10_000) * 10_000;

  if (amount < minimum) amount = minimum;
  if (amount > room.settings.maxBid) {
    return { error: `Bids are capped at ${(room.settings.maxBid / 100000).toFixed(0)} lakh.` };
  }
  if (amount > maxAffordable(room, team)) {
    return { error: 'Not enough left in your purse (you must keep enough to fill a minimum squad).' };
  }

  lot.currentBid = amount;
  lot.bidderTeamId = team.id;
  lot.bidderTeamName = team.name;
  // Any member can raise the paddle, so the table needs to see who just did.
  lot.byName = byName || null;
  lot.byMemberId = byMemberId || null;
  lot.passed = lot.passed.filter((id) => id !== team.id);

  // Keep the clock honest: a late bid always buys everyone a few more seconds.
  const remaining = lot.endsAt - Date.now();
  const reset = Math.max(remaining, Math.min(BID_RESET_FLOOR_MS, lotSeconds(room) * 1000));
  lot.endsAt = Date.now() + reset;
  lot.windowMs = reset;
  room.lastActivity = Date.now();

  io.to(room.code).emit('auction:bid', {
    teamId: team.id,
    teamName: team.name,
    color: team.color,
    amount,
    byName: lot.byName,
    byMemberId: lot.byMemberId,
    endsAt: lot.endsAt,
    windowMs: reset,
    nextBid: nextBidAmount(amount, true),
    increment: bidIncrement(amount),
    passed: lot.passed,
    playerId: lot.player.id,
  });

  schedule(room.code, reset, () => closeLot(io, room));
  maybeCloseOnPasses(io, room);
  return { ok: true, amount };
}

export function passLot(io, room, team) {
  const lot = room.lot;
  if (!lot || lot.status !== 'live') return { error: 'No live lot right now.' };
  if (lot.bidderTeamId === team.id) return { error: 'You cannot pass on your own bid.' };
  if (!lot.passed.includes(team.id)) lot.passed.push(team.id);
  io.to(room.code).emit('auction:pass', { teamId: team.id, teamName: team.name, passed: lot.passed });
  maybeCloseOnPasses(io, room);
  return { ok: true };
}

/**
 * If every team that could still bid has passed, do not make everyone sit out the
 * rest of a 90 second clock - drop to a short "going, going" window instead. A team
 * can still jump back in during it, and any bid resets the clock properly.
 */
function maybeCloseOnPasses(io, room) {
  const lot = room.lot;
  if (!lot || lot.status !== 'live') return;
  const contenders = activeTeams(room).filter(
    (t) => t.id !== lot.bidderTeamId && maxAffordable(room, t) >= nextBidAmount(lot.currentBid, Boolean(lot.bidderTeamId)),
  );
  const allPassed = contenders.length > 0 && contenders.every((t) => lot.passed.includes(t.id));
  const noContenders = contenders.length === 0;
  if (!allPassed && !noContenders) return;

  // Never lengthen a clock that is already closer than the going-going window.
  if (lot.endsAt - Date.now() <= PASS_CLOSE_MS) return;

  lot.endsAt = Date.now() + PASS_CLOSE_MS;
  lot.windowMs = PASS_CLOSE_MS;
  io.to(room.code).emit('auction:clock', {
    endsAt: lot.endsAt,
    windowMs: PASS_CLOSE_MS,
    reason: 'passes',
    playerId: lot.player.id,
  });
  schedule(room.code, PASS_CLOSE_MS, () => closeLot(io, room, 'no other team was interested'));
}

export function closeLot(io, room, reason) {
  const lot = room.lot;
  if (!lot || lot.status !== 'live') return;
  clearRoomTimer(room.code);

  const team = lot.bidderTeamId ? room.teams.find((t) => t.id === lot.bidderTeamId) : null;
  let sale;

  if (team && canTeamBid(room, team, lot.currentBid)) {
    lot.status = 'sold';
    team.purse -= lot.currentBid;
    const bought = { ...lot.player, price: lot.currentBid, soldToTeamId: team.id };
    team.squad.push(bought);
    sale = {
      player: bought,
      teamId: team.id,
      teamName: team.name,
      byName: lot.byName,
      color: team.color,
      price: lot.currentBid,
      status: 'sold',
      at: new Date(),
    };
  } else {
    lot.status = 'unsold';
    room.unsoldQueue.push(lot.player);
    sale = { player: lot.player, teamId: null, teamName: null, price: 0, status: 'unsold', at: new Date(), reason };
  }

  room.history.push(sale);
  room.lastActivity = Date.now();

  io.to(room.code).emit('auction:closed', {
    sale,
    teams: room.teams.map((t) => ({ id: t.id, purse: t.purse, squadCount: t.squad.length })),
    nextIn: BREAK_MS,
  });
  persistRoom(room);

  // Commentary is best-effort and never holds up the next lot.
  auctioneerLine({
    player: sale.player,
    teamName: sale.teamName,
    price: sale.price,
    unsold: sale.status === 'unsold',
    formatId: room.settings?.format,
  })
    .then((text) => {
      if (!text) return;
      const line = { text, playerId: sale.player.id, at: Date.now() };
      room.commentary.push(line);
      io.to(room.code).emit('auction:commentary', line);
    })
    .catch(() => {});

  schedule(room.code, BREAK_MS, () => openNextLot(io, room));
}

/** How long teams get to name a side before one is picked for them. */
export const XI_SELECT_MS = 150_000;

/**
 * The auction is over, but the game is not: every side now names an XI, a captain and
 * a keeper (plus an impact player in the IPL). Judging the team you actually picked is
 * a different game from judging everything you happened to buy.
 */
export function finishAuction(io, room, reason) {
  if (room.status === 'finished' || room.status === 'selecting') return;
  clearRoomTimer(room.code);
  room.lot = null;

  // Nobody signed anybody, so there is no side to name. Skipping straight to the
  // verdict also means a host who ends the auction immediately is not made to sit
  // through a selection window with an empty squad.
  if (!room.teams.some((t) => (t.squad || []).length > 0)) {
    room.status = 'auction';
    concludeAuction(io, room, reason);
    return;
  }

  room.status = 'selecting';
  room.selectionEndsAt = Date.now() + XI_SELECT_MS;
  room.teams.forEach((t) => {
    t.xi = null;
  });
  broadcastRoom(io, room, { includePool: false });
  io.to(room.code).emit('auction:selecting', {
    reason: reason || 'Auction complete.',
    endsAt: room.selectionEndsAt,
    seconds: Math.round(XI_SELECT_MS / 1000),
  });
  persistRoom(room);

  // Anyone who never submits gets the best legal side their squad can field.
  schedule(room.code, XI_SELECT_MS, () => concludeAuction(io, room));
}

/** Records one team's side. Returns the validation result so the caller can reply. */
export function submitTeamXI(io, room, team, selection) {
  if (room.status !== 'selecting') {
    return { ok: false, errors: ['The selection window is closed.'] };
  }
  const formatId = getFormat(room.settings?.format).id;
  const result = validateXI({
    squad: team.squad || [],
    xiIds: selection?.xiIds,
    captainId: selection?.captainId,
    keeperId: selection?.keeperId,
    impactId: selection?.impactId,
    formatId,
  });
  if (!result.ok) return result;

  team.xi = {
    xiIds: result.xi.map((p) => p.id),
    captainId: selection.captainId,
    keeperId: selection.keeperId,
    impactId: selection.impactId ?? null,
    auto: false,
    submittedAt: new Date(),
  };
  room.lastActivity = Date.now();
  broadcastRoom(io, room, { includePool: false });
  persistRoom(room);

  // Once everyone with a squad has named a side there is nothing left to wait for.
  const waiting = room.teams.filter((t) => (t.squad || []).length > 0 && !t.xi);
  if (!waiting.length) {
    clearRoomTimer(room.code);
    schedule(room.code, 600, () => concludeAuction(io, room));
  }
  return result;
}

async function concludeAuction(io, room, reason) {
  if (room.status === 'finished') return;
  clearRoomTimer(room.code);
  const formatId = getFormat(room.settings?.format).id;

  // Fill in for anyone who ran out of time, so every squad is judged on a legal side.
  room.teams.forEach((t) => {
    if ((t.squad || []).length && !t.xi) t.xi = autoPickXI(t.squad, formatId);
  });

  room.status = 'finished';
  room.lot = null;
  room.selectionEndsAt = null;
  broadcastRoom(io, room, { includePool: false });
  io.to(room.code).emit('auction:evaluating', { reason: reason || 'Auction complete.' });
  persistRoom(room);

  // Only squads with players can be scored on their balance, but a franchise that
  // went home empty handed still belongs in the table - dropping it made teams
  // vanish from the standings entirely.
  const contenders = room.teams.filter((t) => t.squad.length > 0);
  const emptyHanded = room.teams.filter((t) => t.squad.length === 0);

  try {
    room.result = await evaluateAuction({ teams: contenders, settings: room.settings });
  } catch (err) {
    console.error('[auction] evaluation failed:', err.message);
    room.result = { error: 'Could not score the auction.', rankings: [] };
  }

  const rankings = room.result.rankings || [];
  emptyHanded.forEach((t) => {
    rankings.push({
      teamId: t.id,
      teamName: t.name,
      overallScore: 0,
      metrics: {},
      strengths: [],
      weaknesses: [],
      bestXI: [],
      // An empty side still carries the shape every other entry has, so the results
      // screen does not have to special-case a team that bought nobody.
      xi: { players: [], captain: null, keeper: null, impact: null, auto: true },
      xiVerdict: 'No squad, so there was no side to name.',
      verdict: `${t.name} did not sign a single player.`,
    });
  });
  rankings.forEach((entry, i) => {
    entry.rank = i + 1;
  });
  room.result.rankings = rankings;
  room.result.finishedAt = new Date().toISOString();
  io.to(room.code).emit('auction:finished', {
    result: room.result,
    teams: room.teams.map((t) => publicTeam(t, room.hostId)),
  });
  persistRoom(room);
}

/** Send a finished room back to the lobby with the same teams and owners. */
export function resetRoom(io, room) {
  clearRoomTimer(room.code);
  room.status = 'lobby';
  room.lot = null;
  room.lotIndex = -1;
  room.pool = [];
  room.history = [];
  room.unsoldQueue = [];
  room.secondRoundDone = false;
  room.result = null;
  room.commentary = [];
  room.paused = false;
  room.teams.forEach((t) => {
    t.purse = room.settings.purse;
    t.squad = [];
  });
  broadcastRoom(io, room);
  toast(io, room, 'info', 'Back in the lobby. Start again whenever you are ready.');
  persistRoom(room);
}

/* ------------------------------------------------------------------ */
/* Pause / resume when the room empties out                            */
/* ------------------------------------------------------------------ */

export function pauseRoom(io, room) {
  if (room.status !== 'auction' || room.paused) return;
  room.paused = true;
  if (room.lot && room.lot.status === 'live') {
    room.lot.remainingMs = Math.max(2000, room.lot.endsAt - Date.now());
  }
  clearRoomTimer(room.code);
  io.to(room.code).emit('room:paused', { paused: true });
}

export function resumeRoom(io, room) {
  if (room.status !== 'auction' || !room.paused) return;
  room.paused = false;
  if (room.lot && room.lot.status === 'live') {
    const ms = room.lot.remainingMs || lotSeconds(room) * 1000;
    room.lot.endsAt = Date.now() + ms;
    room.lot.windowMs = ms;
    delete room.lot.remainingMs;
    schedule(room.code, ms, () => closeLot(io, room));
  } else {
    // We paused between lots, which cancelled the pending "next lot" timer.
    // Without this the auction would sit on the last sold player forever.
    schedule(room.code, 1500, () => openNextLot(io, room));
  }
  io.to(room.code).emit('room:paused', { paused: false });
  broadcastRoom(io, room);
}
