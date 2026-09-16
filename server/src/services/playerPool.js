/**
 * Builds an auction pool from the built-in roster of real cricketers.
 * Used when GEMINI_API_KEY is missing or the Gemini call fails, so a game never
 * blocks on the network.
 *
 * Two things make this feel like a real auction rather than a shuffled deck:
 *
 * 1. Players come up in SETS, the way an IPL auction runs one - a marquee set of the
 *    biggest names, then batters, keepers, all-rounders and bowlers in turn. You can
 *    plan a purse around that, which you cannot do against a random order.
 * 2. Base prices and the marquee list are derived from the format being played, so a
 *    Test auction opens with anchors and seamers rather than death-overs hitters.
 */
import { LAKH, roundToStep } from '../utils/money.js';
import { REAL_PLAYERS } from '../data/realPlayers.js';
import { getFormat } from '../data/formats.js';
import { playerProfile } from './playerModel.js';

/** Roughly the shape of a real auction list, so every team can fill its slots. */
const ROLE_SHARE = {
  Batter: 0.32,
  Bowler: 0.32,
  'All-rounder': 0.24,
  'Wicket-keeper': 0.12,
};

/**
 * The order the sets come under the hammer, mirroring a real auction: the marquee
 * names first while every purse is full, then role by role.
 */
export const AUCTION_SETS = [
  { key: 'marquee', label: 'Marquee' },
  { key: 'Batter', label: 'Batters' },
  { key: 'Wicket-keeper', label: 'Wicket-keepers' },
  { key: 'All-rounder', label: 'All-rounders' },
  { key: 'Bowler', label: 'Bowlers' },
];

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
 * no bidding wars. Spread the range across the full 20K - 5L band instead, using the
 * player's worth IN THIS FORMAT so the price tag matches what you are bidding for.
 */
function basePriceFor(fit, min, max) {
  const span = max - min || 1;
  const t = Math.min(1, Math.max(0, (fit - min) / span));
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
  return picked.slice(0, Math.min(count, REAL_PLAYERS.length));
}

/**
 * Sorts a flat list of players into auction sets: a marquee set of the best names in
 * this format, then role sets in ROUNDS - Batters 1, Keepers 1, All-rounders 1,
 * Bowlers 1, Batters 2, and so on.
 *
 * The rounds matter. Running every batter before the first bowler reads well on paper,
 * but two teams filling fifteen-man squads out of a forty-man pool would take every
 * batter, keeper and all-rounder before a single bowler came up, and neither could then
 * field a legal side. Numbered sets per role are also what a real auction does, and
 * they keep a late purse worth having.
 *
 * Exported because the Gemini pool is ordered through here too - whoever invents the
 * players, the auction runs the same way.
 */
export function intoAuctionSets(players, { marqueeCount = 5, rounds = 3 } = {}) {
  const byFit = [...players].sort((a, b) => (b.profile?.formatFit ?? 0) - (a.profile?.formatFit ?? 0));
  const marqueeSize = Math.min(marqueeCount, Math.max(0, Math.floor(players.length / 8)));
  const marquee = byFit.slice(0, marqueeSize);
  const marqueeIds = new Set(marquee.map((p) => p.id));
  const rest = players.filter((p) => !marqueeIds.has(p.id));

  // The marquee set descends, so the auction opens on its biggest name.
  const ordered = marquee.map((p) => ({ ...p, set: 'marquee', setLabel: 'Marquee' }));

  const roleSets = AUCTION_SETS.filter((s) => s.key !== 'marquee');
  const queues = new Map(roleSets.map((s) => [s.key, shuffle(rest.filter((p) => p.role === s.key))]));

  // Anything with an unrecognised role still has to be sold; put it with the bowlers.
  const known = new Set(roleSets.map((s) => s.key));
  const orphans = rest.filter((p) => !known.has(p.role));
  if (orphans.length) queues.get('Bowler').push(...orphans);

  const perRound = new Map(
    roleSets.map((s) => [s.key, Math.max(1, Math.ceil((queues.get(s.key)?.length || 0) / rounds))]),
  );

  for (let round = 1; round <= rounds; round += 1) {
    for (const set of roleSets) {
      const queue = queues.get(set.key);
      if (!queue?.length) continue;
      // The last round sweeps up whatever is left rather than leaving a stray set.
      const take = round === rounds ? queue.length : perRound.get(set.key);
      const label = rounds > 1 ? `${set.label} ${round}` : set.label;
      for (const p of queue.splice(0, take)) ordered.push({ ...p, set: set.key, setLabel: label });
    }
  }
  return ordered;
}

export function generateLocalPool(count = 40, formatId = 'ipl') {
  const stamp = Date.now().toString(36);
  const drawn = drawBalanced(count).map((p, i) => ({
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
    tags: p.tags,
    stats: p.stats,
    blurb: p.blurb,
    real: true,
    profile: playerProfile(p, formatId),
  }));

  // Price against the spread of THIS pool, so every auction has cheap lots and dear
  // ones no matter which slice of the roster came out.
  const fits = drawn.map((p) => p.profile.formatFit);
  const min = Math.min(...fits);
  const max = Math.max(...fits);
  for (const p of drawn) p.basePrice = basePriceFor(p.profile.formatFit, min, max);

  return intoAuctionSets(drawn);
}

export { REAL_PLAYERS };
