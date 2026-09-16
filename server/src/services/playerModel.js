/**
 * Turns a roster entry into numbers a format can be judged on.
 *
 * The roster carries one set of career-shape T20 numbers per player. Rather than
 * invent separate fake ODI and Test records, this module reads the same numbers
 * through a format's lens: a strike rate of 150 is the headline in the IPL and
 * nearly irrelevant in a Test, where the batting average and the ability to bowl a
 * side out twice are what matter.
 *
 * Three things come out of here, and all three are what the verdict talks about:
 *
 *   legacy    - what the player has already achieved. Slow-moving, built from
 *               volume of cricket plus standing (Legend, Veteran, Captain).
 *   primeForm - where they are on their own curve right now. A young player with a
 *               high rating and few matches is climbing; a Legend with 250 games is
 *               past the peak even though the legacy is enormous.
 *   formatFit - what they are actually worth in the format being played.
 *
 * Every function here is pure and deterministic, so the same squad always scores the
 * same way and the heuristic verdict is reproducible.
 */
import { getFormat } from '../data/formats.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Maps a value in [lo, hi] onto 0-1. Pass lo > hi for "lower is better" stats. */
function scale(value, lo, hi) {
  if (!Number.isFinite(value)) return 0;
  if (lo > hi) return clamp01((lo - value) / (lo - hi));
  return clamp01((value - lo) / (hi - lo));
}

const has = (p, tag) => (p.tags || []).includes(tag);
const bowls = (p) => p.role === 'Bowler' || p.role === 'All-rounder';
const bats = (p) => p.role !== 'Bowler';

/* ------------------------------------------------------------------ */
/* Career shape                                                        */
/* ------------------------------------------------------------------ */

/**
 * What the player has already done. Volume of cricket is the backbone, because you
 * do not play 200 games at this level without being good, with standing layered on
 * top so a Legend outranks a journeyman on the same appearance count.
 */
export function legacyScore(p) {
  const s = p.stats || {};
  const volume = scale(s.matches ?? 0, 0, 240) * 55;
  const standing = scale(p.rating ?? 70, 62, 95) * 30;
  const honours =
    (has(p, 'Legend') ? 14 : 0) + (has(p, 'Veteran') ? 5 : 0) + (has(p, 'Captain') ? 5 : 0);
  return clamp100(volume + standing + honours);
}

/**
 * Where they sit on their own curve. Rating is the ceiling; appearances tell you how
 * much of the career is already spent. An uncapped gem is explicitly on the way up.
 */
export function primeFormScore(p) {
  const s = p.stats || {};
  const matches = s.matches ?? 0;
  const ceiling = scale(p.rating ?? 70, 60, 95) * 100;

  // Bell curve on appearances: ~40-140 games is the peak of a career.
  let curve;
  if (matches < 40) curve = 0.72 + (matches / 40) * 0.28; // still arriving
  else if (matches <= 140) curve = 1;
  else curve = Math.max(0.68, 1 - (matches - 140) / 320); // on the way down

  let v = ceiling * curve;
  if (has(p, 'Uncapped gem')) v += 6;
  if (has(p, 'Veteran')) v -= 8;
  if (has(p, 'Legend') && matches > 200) v -= 5; // the record is the legacy, not the form
  return clamp100(v);
}

/* ------------------------------------------------------------------ */
/* Format fit                                                          */
/* ------------------------------------------------------------------ */

/** Normalised 0-1 readings of the raw record, before any format weighting. */
export function statReadings(p) {
  const s = p.stats || {};
  return {
    battingAverage: scale(s.battingAverage ?? 0, 12, 46),
    strikeRate: scale(s.strikeRate ?? 0, 105, 165),
    // Ranges deliberately run past the best player on the roster, so the top of the
    // scale is an ideal nobody quite reaches rather than a ceiling several share.
    economy: bowls(p) ? scale(s.economy ?? 12, 11, 6.2) : 0, // lower is better
    bowlingAverage: bowls(p) ? scale(s.bowlingAverage ?? 60, 52, 17) : 0, // lower is better
    wickets: scale(s.wickets ?? 0, 0, 220),
    experience: scale(s.matches ?? 0, 0, 240),
    catches: scale(s.catches ?? 0, 0, 120),
  };
}

/** Combined tag multiplier for a format, clamped so no player doubles in value. */
function tagMultiplier(p, format) {
  let mult = 1;
  for (const tag of p.tags || []) {
    if (format.prizedTags?.[tag]) mult *= format.prizedTags[tag];
    if (format.discountedTags?.[tag]) mult *= format.discountedTags[tag];
  }
  return Math.max(0.6, Math.min(1.45, mult));
}

/**
 * What this player is worth in this format, 0-100.
 *
 * Batting and bowling readings are weighted by the format's own scoring table, then
 * blended by role so a specialist is judged on the discipline they are picked for.
 */
export function formatFit(p, formatId) {
  const format = getFormat(formatId);
  const w = format.scoring;
  const r = statReadings(p);
  const legacy = legacyScore(p) / 100;
  const prime = primeFormScore(p) / 100;

  const battingRaw =
    r.battingAverage * w.battingAverage + r.strikeRate * w.strikeRate;
  const battingMax = w.battingAverage + w.strikeRate;
  const batting = battingMax ? battingRaw / battingMax : 0;

  const bowlingRaw =
    r.economy * w.economy + r.bowlingAverage * w.bowlingAverage + r.wickets * w.wickets;
  const bowlingMax = w.economy + w.bowlingAverage + w.wickets;
  const bowling = bowlingMax ? bowlingRaw / bowlingMax : 0;

  // How much of the verdict on this player is about bat versus ball.
  const split = { Batter: 0.95, 'Wicket-keeper': 0.9, 'All-rounder': 0.5, Bowler: 0.08 }[p.role] ?? 0.6;
  const craft = batting * split + bowling * (1 - split);

  const career = legacy * w.legacy + prime * w.primeForm + r.experience * w.experience;
  const careerMax = w.legacy + w.primeForm + w.experience;

  // Craft is the bulk of it; the career terms move a player by a grade, not a league.
  const blended = craft * 0.72 + (careerMax ? career / careerMax : 0) * 0.28;
  return clamp100(blended * 100 * tagMultiplier(p, format));
}

/**
 * Everything the verdict and the XI screen need about one player in one format.
 * Attached to each pool entry at generation time so it travels with the player.
 */
export function playerProfile(p, formatId) {
  return {
    legacy: legacyScore(p),
    primeForm: primeFormScore(p),
    formatFit: formatFit(p, formatId),
  };
}

/* ------------------------------------------------------------------ */
/* Squad-level readings                                                */
/* ------------------------------------------------------------------ */

const avg = (list, f) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0);

/** The best `n` values from a list, averaged. Used for "your top four" style metrics. */
export function topN(list, n, f) {
  const vals = list.map(f).sort((a, b) => b - a).slice(0, n);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

/**
 * Turns an XI into the metric set its format is scored on. Each metric is 0-100 and
 * measures something a selector would actually argue about.
 */
export function scoreXI(xi, formatId, { spend = 0, purse = 1, captainId = null } = {}) {
  const format = getFormat(formatId);
  const fit = (p) => p.profile?.formatFit ?? formatFit(p, formatId);
  const st = (p) => p.stats || {};

  const batters = xi.filter((p) => p.role === 'Batter');
  const keepers = xi.filter((p) => p.role === 'Wicket-keeper');
  const allr = xi.filter((p) => p.role === 'All-rounder');
  const bowlers = xi.filter((p) => p.role === 'Bowler');
  const battingUnit = [...batters, ...keepers, ...allr];
  const bowlingUnit = [...bowlers, ...allr];
  const spinners = bowlingUnit.filter((p) => /spin|orthodox|break|googly|chinaman/i.test(p.bowlingStyle || '') || has(p, 'Spin wizard') || has(p, 'Mystery spinner'));
  const pacers = bowlingUnit.filter((p) => /fast|medium|seam|pace/i.test(p.bowlingStyle || ''));
  const tagged = (list, re) => list.filter((p) => (p.tags || []).some((t) => re.test(t)));

  const all = {
    topOrder: topN(battingUnit, 4, (p) => fit(p)),
    middleOrder: topN([...battingUnit].sort((a, b) => fit(b) - fit(a)).slice(3), 3, (p) => fit(p)),
    battingDepth: battingUnit.length >= 7 ? topN(battingUnit, 7, (p) => fit(p)) : topN(battingUnit, 7, (p) => fit(p)) * (battingUnit.length / 7),
    powerplay: topN(tagged(xi, /powerplay|new-ball/i).length ? tagged(xi, /powerplay|new-ball/i) : xi, 3, (p) => scale(st(p).strikeRate ?? 0, 110, 165) * 100),
    deathOvers: topN(tagged(xi, /death|yorker|slower-ball|finisher/i).length ? tagged(xi, /death|yorker|slower-ball|finisher/i) : xi, 3, (p) => fit(p)) * (tagged(xi, /death|yorker|slower-ball|finisher/i).length ? 1 : 0.62),
    finishing: topN(tagged(xi, /finisher|360|death-overs hitter/i).length ? tagged(xi, /finisher|360|death-overs hitter/i) : battingUnit, 2, (p) => fit(p)) * (tagged(xi, /finisher|360|death-overs hitter/i).length ? 1 : 0.6),
    paceAttack: pacers.length ? topN(pacers, 3, (p) => fit(p)) * Math.min(1, pacers.length / 3) : 0,
    spinAttack: spinners.length ? topN(spinners, 2, (p) => fit(p)) * Math.min(1, spinners.length / 2) : 0,
    wicketTaking: topN(bowlingUnit, 4, (p) => scale(st(p).bowlingAverage || 60, 46, 20) * 100),
    containment: topN(bowlingUnit, 4, (p) => scale(st(p).economy || 12, 10.5, 6.6) * 100),
    allRoundBalance: Math.min(100, allr.length * 24 + avg(allr, (p) => fit(p)) * 0.45),
    endurance: avg(xi, (p) => scale(st(p).matches ?? 0, 0, 200) * 100),
    technique: topN(battingUnit, 5, (p) => scale(st(p).battingAverage ?? 0, 14, 46) * 100),
    keeping: keepers.length ? Math.min(100, avg(keepers, (p) => fit(p)) * 0.8 + scale(avg(xi, (p) => st(p).catches ?? 0), 0, 80) * 30) : 0,
    experience: avg(xi, (p) => scale(st(p).matches ?? 0, 0, 240) * 100),
    legacy: topN(xi, 5, (p) => p.profile?.legacy ?? legacyScore(p)),
    primeForm: avg(xi, (p) => p.profile?.primeForm ?? primeFormScore(p)),
    squadBalance: shapeScore(xi, format),
    valueForMoney: valueScore(xi, formatId, spend, purse),
  };

  const keys = Object.keys(format.weights);
  const metrics = {};
  for (const k of keys) metrics[k] = clamp100(all[k] ?? 0);

  let weighted = 0;
  let total = 0;
  for (const k of keys) {
    weighted += metrics[k] * format.weights[k];
    total += format.weights[k];
  }
  const overall = clamp100(total ? weighted / total : 0);

  // Captaincy is a real edge, but a small one, and only for a genuine leader.
  const captain = xi.find((p) => p.id === captainId);
  const captainBonus = captain && has(captain, 'Captain') ? 2 : 0;

  return { metrics, overall: clamp100(overall + captainBonus), captainBonus };
}

/** How close the XI is to the format's ideal role shape. */
function shapeScore(xi, format) {
  let penalty = 0;
  for (const [role, want] of Object.entries(format.shape)) {
    const count = xi.filter((p) => p.role === role).length;
    if (count < want.min) penalty += (want.min - count) * 18;
    else if (count < want.ideal) penalty += (want.ideal - count) * 6;
    else if (count > want.ideal + 2) penalty += (count - want.ideal - 2) * 5;
  }
  const options = xi.filter((p) => p.role === 'Bowler' || p.role === 'All-rounder').length;
  if (options < format.minBowlingOptions) penalty += (format.minBowlingOptions - options) * 14;
  return clamp100(100 - penalty);
}

/** Runs and wickets per rupee, relative to what the XI cost. */
function valueScore(xi, formatId, spend, purse) {
  if (!xi.length) return 0;
  const worth = xi.reduce((s, p) => s + (p.profile?.formatFit ?? formatFit(p, formatId)), 0);
  const paid = xi.reduce((s, p) => s + (p.price ?? p.basePrice ?? 0), 0);
  if (!paid) return 70;
  // Worth per lakh, normalised against a fair-value benchmark. The top of the range
  // is a genuine steal, not merely a squad bought at base price.
  const perLakh = worth / (paid / 100_000);
  return clamp100(scale(perLakh, 1.5, 22) * 100);
}
