/**
 * Small in-memory guards against a single client flooding the server.
 *
 * A party game for friends does not need Redis-backed quotas, but it does need to
 * survive a stuck finger on the bid button, a hostile tab, or a crawler hammering
 * the room endpoint - all of which are free denial-of-service without a ceiling.
 */

/** Hard ceilings on how much state one process will hold. */
export const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;
export const MAX_TEAMS_PER_ROOM = Number(process.env.MAX_TEAMS_PER_ROOM) || 12;
export const MAX_MEMBERS_PER_TEAM = Number(process.env.MAX_MEMBERS_PER_TEAM) || 8;

/**
 * Token bucket. `capacity` actions are allowed instantly, then they refill at
 * `capacity / windowMs`, so normal bursts pass and sustained spam does not.
 */
export function createRateLimiter({ capacity, windowMs }) {
  const buckets = new Map();
  const refillPerMs = capacity / windowMs;

  const take = (key, cost = 1) => {
    const now = Date.now();
    const bucket = buckets.get(key) || { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) * refillPerMs);
    bucket.at = now;

    if (bucket.tokens < cost) {
      buckets.set(key, bucket);
      const waitMs = Math.ceil((cost - bucket.tokens) / refillPerMs);
      return { ok: false, retryInMs: waitMs };
    }
    bucket.tokens -= cost;
    buckets.set(key, bucket);
    return { ok: true };
  };

  /** Drop idle buckets so a long-running server does not leak one per visitor. */
  const sweep = (maxIdleMs = windowMs * 4) => {
    const cutoff = Date.now() - maxIdleMs;
    for (const [key, bucket] of buckets) {
      if (bucket.at < cutoff) buckets.delete(key);
    }
  };

  return { take, sweep, forget: (key) => buckets.delete(key) };
}

/* Per-socket budgets. Generous enough that real play never notices. */
export const bidLimiter = createRateLimiter({ capacity: 25, windowMs: 10_000 });
export const chatLimiter = createRateLimiter({ capacity: 15, windowMs: 10_000 });
export const joinLimiter = createRateLimiter({ capacity: 20, windowMs: 60_000 });
export const signalLimiter = createRateLimiter({ capacity: 400, windowMs: 10_000 });

/* Per-IP budget for creating rooms over HTTP. */
export const createRoomLimiter = createRateLimiter({ capacity: 10, windowMs: 60_000 });

const allLimiters = [bidLimiter, chatLimiter, joinLimiter, signalLimiter, createRoomLimiter];
setInterval(() => allLimiters.forEach((l) => l.sweep()), 5 * 60_000).unref();
