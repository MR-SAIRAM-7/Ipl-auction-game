/**
 * Builds an auction pool from the built-in roster of real cricketers.
 * Used when GEMINI_API_KEY is missing or the Gemini call fails, so a game never
 * blocks on the network.
 *
 * The roster is fixed, so the players are the same every auction - what changes is
 * which of them come up and in what order. Squad-shape sanity is enforced here: a
 * pool with no keepers in it would make a legal side impossible to build.
 */
import { LAKH, roundToStep } from '../utils/money.js';
import { REAL_PLAYERS } from '../data/realPlayers.js';

/** Roughly the shape of a real auction list, so every team can fill its slots. */
const ROLE_SHARE = {
  Batter: 0.32,
  Bowler: 0.32,
  'All-rounder': 0.24,
  'Wicket-keeper': 0.12,
};

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Real players all cluster in the upper rating band, so scoring them against an
 * absolute 0-100 scale would price everybody between 2.4L and 4.3L - no bargains and
 * no bidding wars. Spread the roster's own range across the full 20K - 5L band instead.
 */
const RATINGS = REAL_PLAYERS.map((p) => p.rating);
const RATING_MIN = Math.min(...RATINGS);
const RATING_MAX = Math.max(...RATINGS);

function basePriceFor(rating) {
  const span = RATING_MAX - RATING_MIN || 1;
  const t = Math.min(1, Math.max(0, (rating - RATING_MIN) / span));
  // 20K floor -> 5L ceiling, so an 11-man squad still fits inside a 50 lakh purse.
  const raw = (0.2 + t ** 1.7 * 4.8) * LAKH;
  return Math.min(5 * LAKH, roundToStep(raw, 10_000));
}

/**
 * Picks `count` players, keeping the role mix close to ROLE_SHARE rather than
 * letting a random draw hand out fifteen bowlers and no keeper.
 */
function drawBalanced(count) {
  const byRole = new Map();
  for (const p of REAL_PLAYERS) {
    if (!byRole.has(p.role)) byRole.set(p.role, []);
    byRole.get(p.role).push(p);
  }
  for (const [role, list] of byRole) byRole.set(role, shuffle(list));

  const picked = [];
  for (const [role, share] of Object.entries(ROLE_SHARE)) {
    const want = Math.round(count * share);
    picked.push(...(byRole.get(role) || []).slice(0, want));
  }

  // Top up (or trim) from whoever is left, so we always return exactly `count`.
  if (picked.length < count) {
    const taken = new Set(picked.map((p) => p.key));
    picked.push(...shuffle(REAL_PLAYERS.filter((p) => !taken.has(p.key))).slice(0, count - picked.length));
  }
  return shuffle(picked).slice(0, Math.min(count, REAL_PLAYERS.length));
}

export function generateLocalPool(count = 40) {
  const stamp = Date.now().toString(36);
  return drawBalanced(count).map((p, i) => ({
    // A fresh id per auction, so the same player can be re-signed in a later game.
    id: `p_${stamp}_${i}_${Math.random().toString(36).slice(2, 7)}`,
    name: p.name,
    role: p.role,
    country: p.country,
    age: p.age ?? null,
    overseas: p.overseas,
    battingStyle: p.battingStyle,
    bowlingStyle: p.bowlingStyle,
    rating: p.rating,
    basePrice: basePriceFor(p.rating),
    tags: p.tags,
    stats: p.stats,
    blurb: p.blurb,
    real: true,
  }));
}

export { REAL_PLAYERS };
