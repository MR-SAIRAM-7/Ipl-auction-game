/**
 * The auctioneer's voice, generated locally.
 *
 * This used to be a Gemini call per lot, which is the single most expensive thing the
 * app did: a forty-player auction meant forty requests, against a free tier that
 * allows twenty A DAY. One game exhausted the quota, and the pool generation and the
 * final verdict - the two calls actually worth spending on - failed with it.
 *
 * So commentary is written here instead. It costs nothing, it works with no key and
 * no network, and because it reads the real numbers it is often sharper than a
 * generic model line: it knows the price against the base, whether a bidding war broke
 * out, what the player is FOR in this format, and whether the buyer just landed a
 * bargain or overpaid badly.
 *
 * Gemini can still write the line when GEMINI_COMMENTARY=gemini is set explicitly,
 * for anyone on a paid tier who wants it.
 */
import { formatINR } from '../utils/money.js';
import { getFormat } from '../data/formats.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const surname = (name) => String(name || '').trim().split(/\s+/).slice(-1)[0] || 'He';

/** How far over the base price the hammer fell. 1 means it went for base. */
const multiple = (price, base) => (base > 0 ? price / base : 1);

/** What this player is actually for, in the format being played. */
function speciality(player, formatId) {
  const tags = player.tags || [];
  const format = getFormat(formatId);
  const t20 = format.id === 'ipl';
  const red = format.id === 'test';

  if (red) {
    if (tags.includes('Anchor')) return 'someone to bat all day';
    if (tags.includes('Wicket-taker')) return 'a bowler who takes the ball when it is flat';
    if (tags.includes('New-ball enforcer')) return 'the new ball in good hands';
    if (tags.includes('Legend')) return 'a name for the honours board';
    if (tags.includes('Finisher')) return 'a white-ball finisher, which is a curious buy for five days';
  }
  if (t20) {
    if (tags.includes('Death-overs specialist') || tags.includes('Yorker machine')) return 'the last four overs sorted';
    if (tags.includes('Finisher')) return 'someone to be there at the end';
    if (tags.includes('Powerplay enforcer')) return 'the first six overs taken on';
    if (tags.includes('360-degree hitter')) return 'shots to parts of the ground nobody else finds';
    if (tags.includes('Mystery spinner')) return 'something the middle order will not read';
  }
  if (tags.includes('Chase master')) return 'a head that stays cold in a chase';
  if (tags.includes('Spin wizard')) return 'control through the middle';
  if (tags.includes('Express pace')) return 'genuine pace';
  if (player.role === 'Wicket-keeper') return 'the gloves and runs with them';
  if (player.role === 'All-rounder') return 'two jobs filled by one man';
  return null;
}

/** Lines for a hammer that fell close to the base price. */
const BARGAIN = [
  (p, team) => `${team} get ${p.name} at base. Nobody else even raised a hand.`,
  (p, team) => `That is daylight robbery. ${p.name} to ${team} for the asking price.`,
  (p, team) => `${p.name} goes cheap, and ${team} will not believe their luck.`,
  (p, team) => `Unopposed. ${surname(p.name)} joins ${team} without a fight.`,
];

/** Lines for a genuine bidding war. */
const WAR = [
  (p, team, price) => `${team} would not be denied. ${p.name} theirs for ${price}.`,
  (p, team, price) => `They went to war over ${surname(p.name)}, and ${team} won it at ${price}.`,
  (p, team, price) => `Paddle after paddle, and it is ${team} left standing. ${price}.`,
  (p, team, price) => `${price} for ${p.name}. Somebody wanted him very badly indeed.`,
];

/** Lines for a wildly inflated price. */
const OVERPAY = [
  (p, team, price) => `${price} for ${surname(p.name)}. ${team} had better be right about that one.`,
  (p, team, price) => `That is a lot of money. ${team} have backed ${p.name} to the hilt at ${price}.`,
  (p, team, price) => `The room went quiet. ${price} is a statement, and ${team} just made it.`,
];

const STRAIGHT = [
  (p, team, price) => `${p.name} to ${team} for ${price}.`,
  (p, team, price) => `Sold. ${surname(p.name)} heads to ${team}, ${price}.`,
  (p, team, price) => `${team} get their man. ${price} for ${p.name}.`,
];

const UNSOLD = [
  (p) => `Not a single bid for ${p.name}. He goes unsold.`,
  (p) => `Silence in the room. ${p.name} finds no takers.`,
  (p) => `${p.name} goes back on the shelf. Somebody may regret that.`,
  (p) => `No interest at all in ${surname(p.name)}. Unsold.`,
];

const MARQUEE_UNSOLD = [
  (p) => `Extraordinary. ${p.name} goes unsold, and nobody can quite believe it.`,
  (p) => `A marquee name and not one hand went up. ${p.name} is unsold.`,
];

/**
 * Writes one line about a completed lot. Always returns something - commentary that
 * sometimes appears and sometimes does not reads like a bug rather than a flourish.
 */
export function localCommentary({ player, teamName, price, unsold, formatId = 'ipl' }) {
  if (!player) return null;

  if (unsold) {
    const base = pick(player.set === 'marquee' ? MARQUEE_UNSOLD : UNSOLD)(player);
    const fit = player.profile?.formatFit;
    // A player nobody wanted who is genuinely good in this format is worth a note.
    if (fit != null && fit >= 70) {
      return `${base} On these numbers that is a mistake.`;
    }
    return base;
  }

  const shown = formatINR(price);
  const m = multiple(price, player.basePrice);

  let line;
  if (m <= 1.05) line = pick(BARGAIN)(player, teamName, shown);
  else if (m >= 3.2) line = pick(OVERPAY)(player, teamName, shown);
  else if (m >= 1.9) line = pick(WAR)(player, teamName, shown);
  else line = pick(STRAIGHT)(player, teamName, shown);

  // Add the "why" roughly half the time, so it colours the auction without becoming
  // a formula you can predict.
  const why = speciality(player, formatId);
  if (why && Math.random() < 0.55) {
    line += ` That is ${why}.`;
  } else if (player.set === 'marquee' && Math.random() < 0.5) {
    line += ' A marquee name off the board.';
  }

  return line;
}

/** Announced when the auction moves into a new set, the way a real one calls them. */
export function setChangeLine(setLabel, formatId) {
  const format = getFormat(formatId);
  const lines = [
    `Next up: the ${setLabel.toLowerCase()}.`,
    `We move to the ${setLabel.toLowerCase()}.`,
    `${setLabel} now. Purses out.`,
  ];
  if (/bowler/i.test(setLabel) && format.id === 'test') {
    return `${pick(lines)} You do not win a Test without twenty wickets.`;
  }
  if (/bowler/i.test(setLabel) && format.id === 'ipl') {
    return `${pick(lines)} Somebody still has to bowl the death overs.`;
  }
  return pick(lines);
}
