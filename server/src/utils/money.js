export const LAKH = 100_000;
export const CRORE = 10_000_000;

/** Hard ceiling for any single bid: 50 lakh. */
export const MAX_BID = 50 * LAKH;

/** Default purse handed to every team at the start of the auction. */
export const DEFAULT_PURSE = 50 * LAKH;

export function formatINR(value) {
  const v = Number(value) || 0;
  if (v >= CRORE) return `₹${(v / CRORE).toFixed(2)} Cr`;
  if (v >= LAKH) return `₹${(v / LAKH).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

/** IPL-style slab increments, scaled down for a 50 lakh purse. */
export function bidIncrement(current) {
  if (current < 1 * LAKH) return 10_000;
  if (current < 5 * LAKH) return 25_000;
  if (current < 10 * LAKH) return 50_000;
  if (current < 25 * LAKH) return 1 * LAKH;
  return 2.5 * LAKH;
}

/** The only legal next bid for a live lot. */
export function nextBidAmount(currentBid, hasBidder) {
  if (!hasBidder) return currentBid; // opening bid sits at base price
  return Math.min(currentBid + bidIncrement(currentBid), MAX_BID);
}

export function roundToStep(value, step = 10_000) {
  return Math.max(step, Math.round(value / step) * step);
}
