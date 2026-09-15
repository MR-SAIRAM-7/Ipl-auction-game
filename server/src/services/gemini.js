/**
 * Gemini integration (REST, no SDK dependency).
 * Every function degrades gracefully: if the key is missing, the request times out
 * or the JSON is malformed, we fall back to a local generator / heuristic so the
 * auction never stalls.
 */
import { generateLocalPool } from './playerPool.js';
import { LAKH, MAX_BID, formatINR, roundToStep } from '../utils/money.js';

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
export async function generatePlayerPool({ count = 40 } = {}) {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const seed = Math.random().toString(36).slice(2, 10).toUpperCase();

  if (!geminiEnabled()) {
    return { players: shuffle(generateLocalPool(count)), source: 'local', theme };
  }

  const prompt = [
    'You are the scouting engine for an IPL-style player auction game played between friends.',
    '',
    `Pick EXACTLY ${count} REAL cricketers for the auction pool.`,
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
    return { players: shuffle(players), source: 'gemini', theme };
  } catch (err) {
    console.warn('[gemini] pool generation failed, using local pool:', err.message);
    return { players: shuffle(generateLocalPool(count)), source: 'local', theme };
  }
}

/* ------------------------------------------------------------------ */
/* 2. Post-auction verdict                                             */
/* ------------------------------------------------------------------ */

export const METRIC_KEYS = [
  'battingDepth',
  'bowlingAttack',
  'allRounderBalance',
  'powerplayImpact',
  'deathOvers',
  'spinOptions',
  'fieldingAndKeeping',
  'squadBalance',
  'valueForMoney',
];

const METRICS_SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(METRIC_KEYS.map((k) => [k, { type: 'NUMBER' }])),
  required: METRIC_KEYS,
};

const VERDICT_SCHEMA = {
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
          metrics: METRICS_SCHEMA,
          strengths: { type: 'ARRAY', items: { type: 'STRING' } },
          weaknesses: { type: 'ARRAY', items: { type: 'STRING' } },
          bestXI: { type: 'ARRAY', items: { type: 'STRING' } },
          verdict: { type: 'STRING' },
        },
        required: [
          'teamId', 'teamName', 'rank', 'overallScore', 'metrics',
          'strengths', 'weaknesses', 'bestXI', 'verdict',
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
  },
  required: ['winnerTeamId', 'headline', 'summary', 'rankings', 'bestBuy', 'worstBuy'],
};

function describeTeamsForPrompt(teams, settings) {
  return teams
    .map((t) => {
      const squad = t.squad
        .map((p) => {
          const line1 = `    - ${p.name} (${p.role}, ${p.country}${p.overseas ? ', overseas' : ''}, rating ${p.rating})`;
          const line2 = ` bought ${formatINR(p.price)} (base ${formatINR(p.basePrice)})`;
          const line3 = ` | bat avg ${p.stats.battingAverage}, SR ${p.stats.strikeRate}, wkts ${p.stats.wickets}, econ ${p.stats.economy}`;
          const line4 = ` | tags: ${(p.tags || []).join(', ') || 'none'}`;
          return line1 + line2 + line3 + line4;
        })
        .join('\n');
      const header = `  TEAM id=${t.id} name="${t.name}" owner="${t.ownerName}"`;
      const money = `    Spent ${formatINR(settings.purse - t.purse)} of ${formatINR(settings.purse)} | Remaining ${formatINR(t.purse)} | Squad size ${t.squad.length}`;
      return [header, money, squad || '    (no players bought)'].join('\n');
    })
    .join('\n\n');
}

const pretty = (k) => k.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

/** Heuristic scoring used when Gemini is unavailable. */
export function heuristicVerdict(teams, settings) {
  const scored = teams.map((t) => {
    const squad = t.squad;
    const by = (r) => squad.filter((p) => p.role === r);
    const avg = (arr, f) => (arr.length ? arr.reduce((s, p) => s + f(p), 0) / arr.length : 0);
    const batters = [...by('Batter'), ...by('Wicket-keeper')];
    const bowlers = by('Bowler');
    const allr = by('All-rounder');
    const spend = settings.purse - t.purse;
    const clamp = (v) => Math.max(0, Math.min(100, v));

    const metrics = {
      battingDepth: clamp(avg([...batters, ...allr], (p) => p.rating) * (Math.min(6, batters.length + allr.length) / 6)),
      bowlingAttack: clamp(avg([...bowlers, ...allr], (p) => p.rating) * (Math.min(5, bowlers.length + allr.length) / 5)),
      allRounderBalance: clamp(allr.length * 22 + avg(allr, (p) => p.rating) * 0.4),
      powerplayImpact: clamp(avg(squad, (p) => p.stats.strikeRate) * 0.5),
      deathOvers: clamp(
        avg(squad.filter((p) => (p.tags || []).some((x) => /death|finisher|yorker/i.test(x))), (p) => p.rating) || 45,
      ),
      spinOptions: clamp(squad.filter((p) => /spin|break|orthodox|googly/i.test(p.bowlingStyle || '')).length * 25 + 25),
      fieldingAndKeeping: clamp(by('Wicket-keeper').length * 28 + avg(squad, (p) => Math.min(60, p.stats.catches)) * 0.7),
      squadBalance: clamp(
        100
        - Math.abs(4 - batters.length) * 9
        - Math.abs(4 - bowlers.length) * 9
        - Math.abs(2 - allr.length) * 8
        - Math.abs(1 - by('Wicket-keeper').length) * 10,
      ),
      // ~25 rating points bought per lakh spent is an excellent return; scale against that.
      valueForMoney: clamp(spend > 0 ? (squad.reduce((s, p) => s + p.rating, 0) / (spend / LAKH) / 25) * 100 : 0),
    };

    const overallScore = Number((Object.values(metrics).reduce((s, v) => s + v, 0) / METRIC_KEYS.length).toFixed(1));
    const ordered = Object.entries(metrics).sort((a, b) => b[1] - a[1]);

    return {
      teamId: t.id,
      teamName: t.name,
      overallScore,
      metrics,
      strengths: ordered.slice(0, 2).map(([k, v]) => `Strong ${pretty(k)} (${v.toFixed(0)}/100)`),
      weaknesses: ordered.slice(-2).map(([k, v]) => `Thin ${pretty(k)} (${v.toFixed(0)}/100)`),
      bestXI: [...squad].sort((a, b) => b.rating - a.rating).slice(0, 11).map((p) => p.name),
      verdict: `${t.name} spent ${formatINR(spend)} on ${squad.length} players and averaged a rating of ${avg(squad, (p) => p.rating).toFixed(0)}.`,
    };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);
  scored.forEach((s, i) => {
    s.rank = i + 1;
  });

  const allBuys = teams.flatMap((t) => t.squad.map((p) => ({ ...p, teamName: t.name })));
  const value = [...allBuys].sort((a, b) => b.rating / Math.max(1, b.price) - a.rating / Math.max(1, a.price));
  const best = value[0];
  const worst = value.length > 1 ? value[value.length - 1] : null;

  return {
    winnerTeamId: scored[0] ? scored[0].teamId : null,
    headline: scored[0] ? `${scored[0].teamName} win the auction` : 'No teams to judge',
    summary: 'Scored with the built-in balance model because Gemini was unavailable. Add a GEMINI_API_KEY for a full analyst breakdown.',
    rankings: scored,
    bestBuy: best
      ? { playerName: best.name, teamName: best.teamName, reason: `Rating ${best.rating} for only ${formatINR(best.price)}.` }
      : { playerName: '-', teamName: '-', reason: 'No players sold.' },
    worstBuy: worst
      ? { playerName: worst.name, teamName: worst.teamName, reason: `Paid ${formatINR(worst.price)} for a rating of ${worst.rating}.` }
      : { playerName: '-', teamName: '-', reason: 'Not enough sales to judge.' },
    source: 'local',
  };
}

export async function evaluateAuction({ teams, settings }) {
  if (!teams.length || !geminiEnabled()) return heuristicVerdict(teams, settings);

  const prompt = [
    'You are a world-class T20 cricket analyst judging a completed fantasy IPL auction.',
    '',
    `Auction rules: every team started with a purse of ${formatINR(settings.purse)} and no single bid could exceed ${formatINR(MAX_BID)}.`,
    `A full squad is ${settings.squadSize} players and the minimum viable squad is ${settings.minSquad}.`,
    '',
    'SQUADS:',
    describeTeamsForPrompt(teams, settings),
    '',
    'Judge every team on these nine metrics, each scored 0-100:',
    METRIC_KEYS.join(', ') + '.',
    '',
    'Then:',
    '- "overallScore" is a weighted 0-100 number. Weight bowlingAttack and battingDepth most heavily, then squadBalance and allRounderBalance, then the rest. Punish squads that are short of players or missing a wicket-keeper. Reward squads that bought high ratings cheaply.',
    '- Rank all teams from 1 (best) downwards. Ranks must be unique.',
    '- "winnerTeamId" MUST be the teamId of the rank-1 team, copied exactly from the list above.',
    '- "bestXI" is the strongest playing eleven from that squad, by player name. If the squad has fewer than 11 players, list everyone.',
    '- "strengths" and "weaknesses": 2-3 short bullet phrases each, naming actual players where it helps.',
    '- "verdict": two sentences of sharp, confident analysis for that team.',
    '- "headline": a punchy broadcast-style headline about the winner, max 12 words.',
    '- "summary": 3-4 sentences comparing the top teams and explaining why the winner edged it.',
    '- "bestBuy" and "worstBuy": the single best and worst value-for-money purchases across the whole auction.',
    '',
    'Be decisive and specific. Return ONLY JSON.',
  ].join('\n');

  try {
    const raw = await callGemini({
      prompt,
      schema: VERDICT_SCHEMA,
      temperature: 0.45,
      maxOutputTokens: 65_536,
    });
    const validIds = new Set(teams.map((t) => t.id));
    const rankings = (raw.rankings || [])
      .filter((r) => validIds.has(r.teamId))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    if (!rankings.length) throw new Error('Gemini returned no usable rankings');
    return {
      ...raw,
      rankings,
      winnerTeamId: validIds.has(raw.winnerTeamId) ? raw.winnerTeamId : rankings[0].teamId,
      source: 'gemini',
    };
  } catch (err) {
    console.warn('[gemini] verdict failed, using heuristic:', err.message);
    return heuristicVerdict(teams, settings);
  }
}

/* ------------------------------------------------------------------ */
/* 3. Auctioneer commentary (best-effort, never blocks the auction)    */
/* ------------------------------------------------------------------ */

export async function auctioneerLine({ player, teamName, price, unsold }) {
  if (!geminiEnabled() || process.env.GEMINI_COMMENTARY === 'false') return null;

  const prompt = unsold
    ? `You are a witty IPL auctioneer. ${player.name} (${player.role}, rating ${player.rating}, base ${formatINR(player.basePrice)}) went UNSOLD. Give ONE short line of live commentary, max 16 words. No quotes, no emoji.`
    : `You are a witty IPL auctioneer. ${teamName} just bought ${player.name} (${player.role}, rating ${player.rating}) for ${formatINR(price)} against a base price of ${formatINR(player.basePrice)}. Give ONE short line of live commentary, max 16 words. No quotes, no emoji.`;

  try {
    const line = await callGemini({ prompt, temperature: 1.1, maxOutputTokens: 256, thinkingBudget: 0 });
    return line.replace(/^["']|["']$/g, '').slice(0, 160);
  } catch {
    return null;
  }
}
