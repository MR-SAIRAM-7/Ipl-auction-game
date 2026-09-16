/**
 * Gemini integration (REST, no SDK dependency).
 * Every function degrades gracefully: if the key is missing, the request times out
 * or the JSON is malformed, we fall back to a local generator / heuristic so the
 * auction never stalls.
 */
import { generateLocalPool, intoAuctionSets } from './playerPool.js';
import { LAKH, MAX_BID, formatINR, roundToStep } from '../utils/money.js';
import { METRIC_LABELS, getFormat, metricKeysFor } from '../data/formats.js';
import { playerProfile, scoreXI } from './playerModel.js';
import { resolveXI } from './playingXI.js';
import { localCommentary } from './commentary.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;

const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const geminiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

async function rawCall({ prompt, schema, temperature, maxOutputTokens, thinkingBudget }) {
  const key = process.env.GEMINI_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_ROOT}/${model()}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          ...(thinkingBudget === undefined ? {} : { thinkingConfig: { thinkingBudget } }),
          ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text || '').join('') ?? '';
    if (!text) {
      throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason || 'unknown'})`);
    }
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was cut off by the token limit');
    }
    return schema ? JSON.parse(text) : text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One retry on transient failures, plus a fallback for models that reject
 * thinkingConfig (older Gemini versions) so a custom GEMINI_MODEL still works.
 */
async function callGemini({ prompt, schema, temperature = 1, maxOutputTokens = 32_768, thinkingBudget }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const args = { prompt, schema, temperature, maxOutputTokens, thinkingBudget };
  try {
    return await rawCall(args);
  } catch (err) {
    if (thinkingBudget !== undefined && /thinking/i.test(err.message)) {
      return rawCall({ ...args, thinkingBudget: undefined });
    }
    if (err.status === 429 || (err.status >= 500 && err.status < 600)) {
      await new Promise((r) => setTimeout(r, 1200));
      return rawCall(args);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* 1. Player pool generation                                           */
/* ------------------------------------------------------------------ */

const STAT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matches: { type: 'INTEGER' },
    battingAverage: { type: 'NUMBER' },
    strikeRate: { type: 'NUMBER' },
    wickets: { type: 'INTEGER' },
    economy: { type: 'NUMBER' },
    bowlingAverage: { type: 'NUMBER' },
    catches: { type: 'INTEGER' },
  },
  required: ['matches', 'battingAverage', 'strikeRate', 'wickets', 'economy', 'bowlingAverage', 'catches'],
};

const POOL_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      role: { type: 'STRING', enum: ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'] },
      country: { type: 'STRING' },
      age: { type: 'INTEGER' },
      battingStyle: { type: 'STRING' },
      bowlingStyle: { type: 'STRING' },
      rating: { type: 'INTEGER' },
      basePriceLakh: { type: 'NUMBER' },
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
      blurb: { type: 'STRING' },
      stats: STAT_SCHEMA,
    },
    required: [
      'name', 'role', 'country', 'age', 'battingStyle', 'bowlingStyle',
      'rating', 'basePriceLakh', 'tags', 'blurb', 'stats',
    ],
  },
};

const THEMES = [
  'uncapped and emerging Indian talent alongside proven overseas franchise stars',
  'mystery spinners and 360-degree power hitters',
  'death-over specialists and finishers being the hottest commodity',
  'a youth-heavy list with a handful of veterans on one last big contract',
  'Impact Player rules, where specialists beat generalists',
  'Caribbean power hitters and Afghan wrist spinners',
];

function normalisePlayers(raw) {
  const seen = new Set();
  return raw
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .filter((p) => {
      const k = p.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p, i) => {
      const rating = Math.min(99, Math.max(40, Math.round(Number(p.rating) || 65)));
      const lakh = Number(p.basePriceLakh);
      const basePrice = Math.min(
        5 * LAKH,
        Math.max(20_000, roundToStep(Number.isFinite(lakh) ? lakh * LAKH : 1.5 * LAKH, 10_000)),
      );
      const role = ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'].includes(p.role) ? p.role : 'Batter';
      const country = String(p.country || 'India').trim();
      const s = p.stats || {};
      return {
        id: `p_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        name: p.name.trim(),
        role,
        country,
        age: Math.min(45, Math.max(17, Math.round(Number(p.age) || 26))),
        overseas: country.toLowerCase() !== 'india',
        battingStyle: String(p.battingStyle || 'Right-hand bat'),
        bowlingStyle: String(p.bowlingStyle || 'None'),
        rating,
        basePrice,
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 3).map(String) : [],
        blurb: String(p.blurb || '').slice(0, 180),
        stats: {
          matches: Math.max(0, Math.round(Number(s.matches) || 0)),
          battingAverage: Number(Number(s.battingAverage || 0).toFixed(1)),
          strikeRate: Number(Number(s.strikeRate || 0).toFixed(1)),
          wickets: Math.max(0, Math.round(Number(s.wickets) || 0)),
          economy: Number(Number(s.economy || 0).toFixed(2)),
          bowlingAverage: Number(Number(s.bowlingAverage || 0).toFixed(1)),
          catches: Math.max(0, Math.round(Number(s.catches) || 0)),
        },
        aiGenerated: true,
      };
    });
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ask Gemini for a pool of real cricketers. The local roster is the fallback, so a
 * missing key or a failed call still gives you real names.
 * @returns {Promise<{players: any[], source: 'gemini'|'local', theme: string}>}
 */
export async function generatePlayerPool({ count = 40, format: formatId = 'ipl' } = {}) {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const seed = Math.random().toString(36).slice(2, 10).toUpperCase();
  const format = getFormat(formatId);

  /** Gemini returns a flat list; give it the same profiles and set order as the local pool. */
  const dress = (players) =>
    intoAuctionSets(players.map((p) => ({ ...p, profile: playerProfile(p, format.id) })));

  if (!geminiEnabled()) {
    return { players: generateLocalPool(count, format.id), source: 'local', theme };
  }

  const prompt = [
    `You are the scouting engine for a ${format.longName} (${format.name}) player auction game played between friends.`,
    '',
    `Pick EXACTLY ${count} REAL cricketers for the auction pool.`,
    `The auction is being played for ${format.longName}, so favour players who are genuinely good in THAT format - ${format.tagline}`,
    `Randomisation seed: ${seed}. Slant this season's list towards ${theme}.`,
    '',
    'Hard rules:',
    '- Every player must be a REAL cricketer who has played T20 franchise or international cricket. Use their actual name, country, batting hand and bowling style.',
    '- Do NOT invent players, and do not return anyone whose details you are unsure of.',
    '- No duplicates. Vary the selection between seasons using the seed above.',
    '- Roughly 60-70% India, the rest from Australia, England, South Africa, New Zealand, West Indies, Sri Lanka, Afghanistan or Bangladesh.',
    '- Role mix: about 32% Batter, 32% Bowler, 24% All-rounder, 12% Wicket-keeper, and give each player the role they actually play.',
    '- "rating" is your editorial T20 value score from 40 to 99 - how badly a franchise would want them. Spread it: a handful of superstars (90+), some strong (78-89), the rest solid squad players.',
    '- "basePriceLakh" is the base price in LAKHS of rupees and MUST be between 0.2 and 5.0, with one decimal place. It tracks rating: a 95-rated superstar sits near 4.5-5.0, a squad filler near 0.2-0.5. This is the game\'s own scaled-down economy, not a real auction price.',
    '- Stats should be that player\'s realistic career T20 figures, rounded. Approximate is fine - they are flavour, not a record book. Pure Batters and Wicket-keepers get wickets 0, economy 0 and bowlingAverage 0. Bowlers get a low battingAverage (5-20).',
    '- "age" is their approximate age in years today.',
    '- "tags" are 1-3 short scouting labels that genuinely fit that player, such as "Death-overs specialist", "Powerplay enforcer", "Mystery spinner", "Finisher".',
    '- "blurb" is one punchy scouting sentence about that specific player, max 18 words.',
    '',
    'Return ONLY the JSON array.',
  ].join('\n');

  try {
    const raw = await callGemini({
      prompt,
      schema: POOL_SCHEMA,
      temperature: 1.35,
      maxOutputTokens: 65_536,
      thinkingBudget: 0,
    });
    const players = normalisePlayers(Array.isArray(raw) ? raw : []);
    if (players.length < Math.min(12, count)) throw new Error('Gemini pool too small');
    return { players: dress(players), source: 'gemini', theme };
  } catch (err) {
    console.warn('[gemini] pool generation failed, using local pool:', err.message);
    return { players: generateLocalPool(count, format.id), source: 'local', theme };
  }
}

/* ------------------------------------------------------------------ */
/* 2. Post-auction verdict                                             */
/* ------------------------------------------------------------------ */
/**
 * Metrics are per format - a Test side is not judged on its death overs - so the
 * schema handed to Gemini is built per call from the format's own weight table.
 */
const metricsSchemaFor = (formatId) => ({
  type: 'OBJECT',
  properties: Object.fromEntries(metricKeysFor(formatId).map((k) => [k, { type: 'NUMBER' }])),
  required: metricKeysFor(formatId),
});

const verdictSchemaFor = (formatId) => ({
  type: 'OBJECT',
  properties: {
    winnerTeamId: { type: 'STRING' },
    headline: { type: 'STRING' },
    summary: { type: 'STRING' },
    rankings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          teamId: { type: 'STRING' },
          teamName: { type: 'STRING' },
          rank: { type: 'INTEGER' },
          overallScore: { type: 'NUMBER' },
          metrics: metricsSchemaFor(formatId),
          strengths: { type: 'ARRAY', items: { type: 'STRING' } },
          weaknesses: { type: 'ARRAY', items: { type: 'STRING' } },
          xiVerdict: { type: 'STRING' },
          verdict: { type: 'STRING' },
        },
        required: [
          'teamId', 'teamName', 'rank', 'overallScore', 'metrics',
          'strengths', 'weaknesses', 'xiVerdict', 'verdict',
        ],
      },
    },
    bestBuy: {
      type: 'OBJECT',
      properties: { playerName: { type: 'STRING' }, teamName: { type: 'STRING' }, reason: { type: 'STRING' } },
      required: ['playerName', 'teamName', 'reason'],
    },
    worstBuy: {
      type: 'OBJECT',
      properties: { playerName: { type: 'STRING' }, teamName: { type: 'STRING' }, reason: { type: 'STRING' } },
      required: ['playerName', 'teamName', 'reason'],
    },
    keyMatchup: { type: 'STRING' },
  },
  required: ['winnerTeamId', 'headline', 'summary', 'rankings', 'bestBuy', 'worstBuy'],
});

/**
 * Describes each side the way a selector would read it: the XI first, because that is
 * what is being judged, then the bench, then the money. Every player carries the three
 * things the verdict is asked to weigh - what they have already done (pedigree), where
 * they are now (form), and what their record says in this format.
 */
function describeTeamsForPrompt(teams, settings, formatId) {
  const format = getFormat(formatId);
  return teams
    .map((t) => {
      const sel = resolveXI(t, formatId);
      const inXI = new Set(sel.players.map((p) => p.id));
      const line = (p, mark = '') => {
        const s = p.stats || {};
        const prof = p.profile || {};
        const role = `${p.role}${p.overseas ? ', overseas' : ''}`;
        const record = `bat ${s.battingAverage} @ SR ${s.strikeRate}` +
          (s.wickets ? `, ${s.wickets} wkts @ ${s.bowlingAverage} econ ${s.economy}` : '') +
          `, ${s.matches} matches`;
        const standing = `pedigree ${prof.legacy ?? '?'}/100, form ${prof.primeForm ?? '?'}/100, ${format.name} fit ${prof.formatFit ?? '?'}/100`;
        const tags = (p.tags || []).join(', ') || 'none';
        return `      ${mark}${p.name} (${role}) - ${record} | ${standing} | tags: ${tags} | paid ${formatINR(p.price ?? 0)} (base ${formatINR(p.basePrice ?? 0)})`;
      };

      const bench = (t.squad || []).filter((p) => !inXI.has(p.id));
      const overseasInXI = sel.players.filter((p) => p.overseas).length;
      const header = `  TEAM id=${t.id} name="${t.name}" owner="${t.ownerName}"`;
      const money = `    Spent ${formatINR(settings.purse - t.purse)} of ${formatINR(settings.purse)} | ${t.squad.length} bought | ${overseasInXI} overseas in the XI`;
      const capt = sel.captain ? `${sel.captain.name} (captain)` : 'no captain named';
      const keep = sel.keeper ? `${sel.keeper.name} (wk)` : 'no keeper named';
      const impact = format.impactPlayer ? ` | impact sub: ${sel.impact ? sel.impact.name : 'none named'}` : '';
      const leadership = `    Leading: ${capt}, ${keep}${impact}${sel.auto ? ' [auto-picked, the team never submitted one]' : ''}`;

      return [
        header,
        money,
        leadership,
        `    PLAYING XI (${sel.players.length}):`,
        sel.players.map((p) => line(p, p.id === sel.captain?.id ? '(C) ' : p.id === sel.keeper?.id ? '(WK) ' : '')).join('\n') || '      (none)',
        bench.length ? `    BENCH (${bench.length}):` : '',
        bench.length ? bench.map((p) => line(p)).join('\n') : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

const pretty = (k) => METRIC_LABELS[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

/**
 * Scoring used when Gemini is unavailable - and the number the AI verdict is checked
 * against. It judges the submitted XI through the format's own weights, so the same
 * squad genuinely scores differently in a Test than it does in the IPL.
 */
export function heuristicVerdict(teams, settings) {
  const formatId = getFormat(settings?.format).id;
  const format = getFormat(formatId);

  const scored = teams.map((t) => {
    const sel = resolveXI(t, formatId);
    const spend = settings.purse - t.purse;
    const { metrics, overall } = scoreXI(sel.players, formatId, {
      spend,
      purse: settings.purse,
      captainId: sel.captainId,
    });
    const ordered = Object.entries(metrics).sort((a, b) => b[1] - a[1]);
    const shortOfXI = sel.players.length < format.xiSize;

    const topName = [...sel.players]
      .sort((a, b) => (b.profile?.formatFit ?? 0) - (a.profile?.formatFit ?? 0))[0];

    return {
      teamId: t.id,
      teamName: t.name,
      overallScore: shortOfXI ? Math.round(overall * (sel.players.length / format.xiSize)) : overall,
      metrics,
      strengths: ordered.slice(0, 3).map(([k, v]) => `${pretty(k)} (${v}/100)`),
      weaknesses: ordered.slice(-3).reverse().map(([k, v]) => `${pretty(k)} (${v}/100)`),
      bestXI: sel.players.map((p) => p.name),
      xi: {
        players: sel.players.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          overseas: Boolean(p.overseas),
          price: p.price ?? 0,
          legacy: p.profile?.legacy ?? null,
          primeForm: p.profile?.primeForm ?? null,
          formatFit: p.profile?.formatFit ?? null,
          isCaptain: p.id === sel.captainId,
          isKeeper: p.id === sel.keeperId,
        })),
        captain: sel.captain?.name ?? null,
        keeper: sel.keeper?.name ?? null,
        impact: sel.impact?.name ?? null,
        auto: Boolean(sel.auto),
      },
      xiVerdict: shortOfXI
        ? `Could only field ${sel.players.length} of ${format.xiSize}, which caps how far this side can go.`
        : `${topName ? `${topName.name} is the one who has to deliver` : 'A side without a standout'}, with ${pretty(ordered[0][0]).toLowerCase()} the clear strength.`,
      verdict: `${t.name} spent ${formatINR(spend)} on ${t.squad.length} players. In ${format.name} terms this side reads best for ${pretty(ordered[0][0]).toLowerCase()} and thinnest for ${pretty(ordered[ordered.length - 1][0]).toLowerCase()}.`,
    };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);
  scored.forEach((s, i) => {
    s.rank = i + 1;
  });

  // Value is worth-in-this-format per rupee, so a bargain in a Test is not the same
  // buy as a bargain in the IPL.
  const allBuys = teams.flatMap((t) =>
    (t.squad || []).map((p) => ({
      ...p,
      teamName: t.name,
      value: (p.profile?.formatFit ?? 0) / Math.max(1, (p.price ?? 0) / LAKH),
    })),
  );
  const value = [...allBuys].sort((a, b) => b.value - a.value);
  const best = value[0];
  const worst = value.length > 1 ? value[value.length - 1] : null;

  return {
    format: formatId,
    formatName: format.name,
    metricKeys: metricKeysFor(formatId),
    metricLabels: Object.fromEntries(metricKeysFor(formatId).map((k) => [k, pretty(k)])),
    winnerTeamId: scored[0] ? scored[0].teamId : null,
    headline: scored[0] ? `${scored[0].teamName} build the best ${format.name} side` : 'No teams to judge',
    summary: `Scored with the built-in ${format.name} model, which weighs each XI on ${metricKeysFor(formatId).length} format-specific metrics. Add a GEMINI_API_KEY for a full analyst breakdown.`,
    rankings: scored,
    bestBuy: best
      ? { playerName: best.name, teamName: best.teamName, reason: `${format.name} fit of ${best.profile?.formatFit ?? '?'} for only ${formatINR(best.price)}.` }
      : { playerName: '-', teamName: '-', reason: 'No players sold.' },
    worstBuy: worst
      ? { playerName: worst.name, teamName: worst.teamName, reason: `Paid ${formatINR(worst.price)} for a ${format.name} fit of just ${worst.profile?.formatFit ?? '?'}.` }
      : { playerName: '-', teamName: '-', reason: 'Not enough sales to judge.' },
    source: 'local',
  };
}

export async function evaluateAuction({ teams, settings }) {
  const formatId = getFormat(settings?.format).id;
  const format = getFormat(formatId);
  const local = heuristicVerdict(teams, settings);
  if (!teams.length || !geminiEnabled()) return local;

  const keys = metricKeysFor(formatId);
  const prompt = [
    `You are a world-class cricket analyst judging completed ${format.longName} squads (${format.name}).`,
    '',
    `FORMAT: ${format.name} - ${format.longName}. ${format.tagline}`,
    format.overs ? `Each side bowls ${format.overs} overs.` : 'Unlimited overs across five days; you must take twenty wickets to win.',
    format.maxOverseasInXI != null ? `A maximum of ${format.maxOverseasInXI} overseas players may play in the XI.` : 'There is no overseas restriction.',
    format.impactPlayer ? 'An impact substitute may replace a player mid-match.' : '',
    '',
    `Auction rules: every team started with ${formatINR(settings.purse)} and no single bid could exceed ${formatINR(MAX_BID)}.`,
    '',
    'Each team has already chosen its playing XI. JUDGE THE XI, not the whole squad - the bench only matters as cover and as evidence of how the money was spent.',
    '',
    'SQUADS:',
    describeTeamsForPrompt(teams, settings, formatId),
    '',
    `Score every team on these ${keys.length} ${format.name}-specific metrics, each 0-100:`,
    keys.map((k) => `- ${k}: ${pretty(k)}`).join('\n'),
    '',
    'How to judge, and this matters more than anything else:',
    `- Judge every player BY ${format.name.toUpperCase()} STANDARDS. A strike rate of 150 is decisive in the IPL and close to irrelevant in a Test; a batting average of 45 is the other way round. A death-overs specialist is a luxury in a Test. An anchor who bats through is worth far more over five days than over twenty overs.`,
    '- Weigh three separate things about each player and say which you are leaning on: PEDIGREE (what they have already achieved over a career), CURRENT FORM (where they are on their own curve right now), and RECORD (the raw batting average, strike rate, wickets, economy and matches given above). A great name in decline is not the same as a player at their peak.',
    '- Then judge the XI AS A UNIT: does it have a top order, enough bowling to take the wickets this format demands, a keeper, and balance? A collection of stars in the wrong shape should lose to a balanced side.',
    '- Punish an XI that is short of players, missing a keeper, or unable to bowl its overs.',
    '- Reward buying well: a high-value player bought cheaply is a real advantage.',
    '',
    'Then:',
    '- "overallScore" is a weighted 0-100 number reflecting the metric weights for this format.',
    '- Rank all teams from 1 (best) downwards. Ranks must be unique.',
    '- "winnerTeamId" MUST be the teamId of the rank-1 team, copied exactly from above.',
    '- "strengths" and "weaknesses": 2-3 short phrases each, naming actual players.',
    '- "xiVerdict": one or two sentences on the XI specifically - its shape, who carries it, where it breaks.',
    '- "verdict": two sentences of sharp, confident analysis of the team overall.',
    '- "headline": a punchy broadcast headline about the winner, max 12 words.',
    '- "summary": 3-4 sentences comparing the top sides and explaining why the winner edged it, in this format.',
    '- "bestBuy" / "worstBuy": best and worst value purchases across the auction, judged in this format.',
    '- "keyMatchup": one sentence on the contest between the top two sides that would decide the game.',
    '',
    'Be decisive and specific. Never hedge. Return ONLY JSON.',
  ].filter(Boolean).join('\n');

  try {
    const raw = await callGemini({
      prompt,
      schema: verdictSchemaFor(formatId),
      temperature: 0.45,
      maxOutputTokens: 65_536,
    });
    const validIds = new Set(teams.map((t) => t.id));
    const byId = new Map(local.rankings.map((r) => [r.teamId, r]));
    const rankings = (raw.rankings || [])
      .filter((r) => validIds.has(r.teamId))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((r, i) => ({
        ...r,
        rank: i + 1,
        // The XI itself is decided by the server, never by the model - the model is
        // judging a side, not picking one.
        xi: byId.get(r.teamId)?.xi ?? null,
        bestXI: byId.get(r.teamId)?.bestXI ?? [],
      }));
    if (!rankings.length) throw new Error('Gemini returned no usable rankings');
    return {
      ...raw,
      format: formatId,
      formatName: format.name,
      metricKeys: keys,
      metricLabels: Object.fromEntries(keys.map((k) => [k, pretty(k)])),
      rankings,
      winnerTeamId: validIds.has(raw.winnerTeamId) ? raw.winnerTeamId : rankings[0].teamId,
      source: 'gemini',
    };
  } catch (err) {
    console.warn('[gemini] verdict failed, using heuristic:', err.message);
    return local;
  }
}

/* ------------------------------------------------------------------ */
/* 3. Auctioneer commentary (best-effort, never blocks the auction)    */
/* ------------------------------------------------------------------ */

export async function auctioneerLine({ player, teamName, price, unsold, formatId = 'ipl' }) {
  const mode = process.env.GEMINI_COMMENTARY;
  if (mode === 'false' || mode === 'off') return null;

  /**
   * Local by default, and deliberately so. One call per lot against a free tier that
   * allows twenty a day meant a single auction burned the whole quota and took the
   * pool generation and the final verdict down with it. Those two are worth spending
   * on; a one-line quip is not. Set GEMINI_COMMENTARY=gemini to buy it back.
   */
  if (mode !== 'gemini' || !geminiEnabled()) {
    return localCommentary({ player, teamName, price, unsold, formatId });
  }

  const prompt = unsold
    ? `You are a witty IPL auctioneer. ${player.name} (${player.role}, rating ${player.rating}, base ${formatINR(player.basePrice)}) went UNSOLD. Give ONE short line of live commentary, max 16 words. No quotes, no emoji.`
    : `You are a witty IPL auctioneer. ${teamName} just bought ${player.name} (${player.role}, rating ${player.rating}) for ${formatINR(price)} against a base price of ${formatINR(player.basePrice)}. Give ONE short line of live commentary, max 16 words. No quotes, no emoji.`;

  try {
    const line = await callGemini({ prompt, temperature: 1.1, maxOutputTokens: 256, thinkingBudget: 0 });
    return line.replace(/^["']|["']$/g, '').slice(0, 160);
  } catch {
    // Quota, timeout, anything - there is always a line to fall back on.
    return localCommentary({ player, teamName, price, unsold, formatId });
  }
}
