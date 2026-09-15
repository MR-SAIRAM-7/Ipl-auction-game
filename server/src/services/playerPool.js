/**
 * Deterministic-ish offline generator. Used when GEMINI_API_KEY is missing or the
 * Gemini call fails, so a game never blocks on the network.
 * Players are fictional so the pool is different every single auction.
 */
import { LAKH, roundToStep } from '../utils/money.js';

const FIRST_IN = ['Arjun', 'Rohan', 'Kartik', 'Vihaan', 'Ishan', 'Devraj', 'Manav', 'Yuvan', 'Aarav', 'Siddharth', 'Nikhil', 'Rudra', 'Pranav', 'Tejas', 'Abhinav', 'Harsh', 'Kabir', 'Aniket', 'Vikram', 'Sourav', 'Madhav', 'Chirag', 'Raghav', 'Omkar', 'Jaydev'];
const LAST_IN = ['Rathore', 'Pillai', 'Deshmukh', 'Iyer', 'Chauhan', 'Bhatt', 'Nayar', 'Sethi', 'Kulkarni', 'Menon', 'Varma', 'Sandhu', 'Tiwari', 'Reddy', 'Gowda', 'Saxena', 'Bose', 'Khurana', 'Rane', 'Mallick'];
const OVERSEAS = [
  ['Jayden', 'Brooke', 'Australia'], ['Callum', 'Radford', 'England'], ['Tyrese', 'Powell', 'West Indies'],
  ['Ruan', 'Steyn', 'South Africa'], ['Kyle', 'Mitchell', 'New Zealand'], ['Dinesh', 'Perera', 'Sri Lanka'],
  ['Shahid', 'Zaman', 'Afghanistan'], ['Mikael', 'Vandersay', 'South Africa'], ['Liam', 'Hartley', 'England'],
  ['Brendon', 'Cross', 'Australia'], ['Jamal', 'Antoine', 'West Indies'], ['Finn', 'Ashworth', 'New Zealand'],
];

const ROLES = [
  { role: 'Batter', weight: 30 },
  { role: 'Bowler', weight: 30 },
  { role: 'All-rounder', weight: 25 },
  { role: 'Wicket-keeper', weight: 15 },
];

const BAT_STYLE = ['Right-hand bat', 'Left-hand bat'];
const BOWL_STYLE = ['Right-arm fast', 'Right-arm medium', 'Left-arm fast', 'Left-arm orthodox', 'Right-arm off-break', 'Leg-break googly', 'Left-arm wrist-spin'];
const COMMON_TAGS = ['Impact player', 'Uncapped gem', 'Big-match temperament', 'Fielding livewire', 'Left-field pick'];
const ROLE_TAGS = {
  Batter: ['Powerplay enforcer', 'Finisher', 'Anchor', '360-degree hitter', 'Spin hitter'],
  Bowler: ['Death-overs specialist', 'Yorker machine', 'Spin wizard', 'New-ball enforcer', 'Mystery spinner'],
  'All-rounder': ['Finisher', 'Powerplay enforcer', 'Death-overs specialist', 'Floater', 'Sixth-bowler option'],
  'Wicket-keeper': ['Powerplay enforcer', 'Finisher', 'Anchor', 'Lightning glovework', '360-degree hitter'],
};

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const between = (a, b) => a + Math.random() * (b - a);

function pickRole() {
  const total = ROLES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of ROLES) {
    roll -= r.weight;
    if (roll <= 0) return r.role;
  }
  return 'Batter';
}

function pickTags(role) {
  // Keep the scouting labels believable: no yorker tags on a pure batter.
  const bank = [...(ROLE_TAGS[role] || []), ...COMMON_TAGS];
  const tags = new Set([pick(ROLE_TAGS[role] || COMMON_TAGS)]);
  const count = 1 + rand(2);
  let guard = 0;
  while (tags.size < count && guard < 20) {
    tags.add(pick(bank));
    guard += 1;
  }
  return [...tags].slice(0, 3);
}

function buildStats(role, rating) {
  const q = rating / 100;
  const bowls = role === 'Bowler' || role === 'All-rounder';
  const batting = role === 'Bowler' ? between(8, 20) : between(22, 46) * (0.7 + q * 0.5);
  const strikeRate = role === 'Bowler' ? between(100, 130) : between(125, 170) * (0.85 + q * 0.25);
  const economy = bowls ? between(6.4, 9.6) - q * 1.6 : 0;
  const bowlingAvg = bowls ? between(18, 34) - q * 4 : 0;
  return {
    matches: Math.round(between(8, 120)),
    battingAverage: Number(batting.toFixed(1)),
    strikeRate: Number(strikeRate.toFixed(1)),
    wickets: bowls ? Math.round(between(4, 140) * (0.6 + q * 0.6)) : 0,
    economy: bowls ? Number(Math.max(5.4, economy).toFixed(2)) : 0,
    bowlingAverage: bowls ? Number(Math.max(12, bowlingAvg).toFixed(1)) : 0,
    catches: Math.round(between(2, 70)),
  };
}

function basePriceFor(rating) {
  // 20K floor -> 5L ceiling, so an 11-man squad still fits inside a 50 lakh purse.
  const raw = (0.2 + Math.pow(rating / 100, 2.1) * 4.8) * LAKH;
  return Math.min(5 * LAKH, roundToStep(raw, 10_000));
}

export function generateLocalPool(count = 40) {
  const used = new Set();
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const isOverseas = Math.random() < 0.32;
    let name;
    let country = 'India';
    let guard = 0;
    do {
      if (isOverseas) {
        const o = pick(OVERSEAS);
        name = `${o[0]} ${o[1]}`;
        country = o[2];
      } else {
        name = `${pick(FIRST_IN)} ${pick(LAST_IN)}`;
        country = 'India';
      }
      guard += 1;
    } while (used.has(name) && guard < 40);
    used.add(name);

    const role = pickRole();
    const rating = Math.round(between(52, 96));
    players.push({
      id: `p_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      role,
      country,
      age: Math.round(between(19, 37)),
      overseas: country !== 'India',
      battingStyle: pick(BAT_STYLE),
      bowlingStyle: role === 'Bowler' || role === 'All-rounder' ? pick(BOWL_STYLE) : 'None',
      rating,
      basePrice: basePriceFor(rating),
      tags: pickTags(role),
      stats: buildStats(role, rating),
      blurb: `${role} with a ${rating >= 85 ? 'match-winning' : rating >= 70 ? 'dependable' : 'raw but exciting'} profile.`,
    });
  }
  return players;
}
