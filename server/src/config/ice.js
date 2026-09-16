/**
 * ICE configuration for the voice mesh.
 *
 * STUN only tells a peer its own public address. That is enough when at least one
 * side sits behind a permissive NAT, which is typical on home wifi.
 *
 * Mobile carriers use CGNAT, which is symmetric: the port a peer sees is not the
 * port anyone else can reach. Two phones on mobile data therefore have no direct
 * path at all, and only a TURN server - which relays the audio - will connect them.
 * Assume anyone joining from a phone needs one.
 *
 * Three ways to supply one, checked in this order:
 *
 * 1. Metered Open Relay (METERED_APP_NAME + METERED_API_KEY). Free monthly
 *    allowance and, unlike the others, no card to sign up - start here.
 * 2. Cloudflare Realtime (TURN_KEY_ID + TURN_KEY_API_TOKEN). Much the largest free
 *    allowance, but signup wants a card.
 * 3. A static relay (TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL) - self-hosted
 *    coturn, Xirsys, or credentials pasted from any provider's dashboard.
 *
 * The first two hand out short-lived credentials, so we fetch them here and pass
 * them to the client through /api/config rather than holding them in env vars.
 *
 * With none of them, voice still works between peers that can reach each other
 * directly, and bidding and chat are unaffected either way.
 */

const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
];

/** Comfortably longer than an auction, so one fetch covers a whole session. */
const CREDENTIAL_TTL_SEC = 4 * 60 * 60;
/** Metered does not document a TTL, so re-fetch often enough not to rely on one. */
const METERED_CACHE_MS = 30 * 60 * 1000;
/** Re-mint this far before expiry rather than handing out a nearly-dead credential. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
/** A slow provider must not hold up the config request the whole app waits on. */
const FETCH_TIMEOUT_MS = 5000;

const staticTurnUrls = () =>
  (process.env.TURN_URLS || process.env.TURN_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const meteredConfigured = () =>
  Boolean(process.env.METERED_APP_NAME) && Boolean(process.env.METERED_API_KEY);

const cloudflareConfigured = () =>
  Boolean(process.env.TURN_KEY_ID) && Boolean(process.env.TURN_KEY_API_TOKEN);

/** A static relay is only usable if it has credentials to go with it. */
const staticConfigured = () =>
  staticTurnUrls().length > 0 && Boolean(process.env.TURN_USERNAME) && Boolean(process.env.TURN_CREDENTIAL);

export const turnMode = () =>
  meteredConfigured() ? 'metered'
    : cloudflareConfigured() ? 'cloudflare'
      : staticConfigured() ? 'static' : 'none';

/** Whether credentials have to be fetched rather than read from the environment. */
const fetchedProvider = () => meteredConfigured() || cloudflareConfigured();

let cached = null; // { servers, expiresAt }

const isFresh = () => cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS;

/**
 * The dashboard shows the app as a full domain, so accept either that or the bare
 * subdomain rather than turning a reasonable copy-paste into a DNS error.
 */
const meteredHost = () => {
  const raw = (process.env.METERED_APP_NAME || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return raw.endsWith('.metered.live') ? raw : `${raw}.metered.live`;
};

/** Metered returns a ready-made iceServers array. We keep only its relay entries. */
async function meteredTurn() {
  const url = `https://${meteredHost()}/api/v1/turn/credentials?apiKey=${encodeURIComponent(process.env.METERED_API_KEY)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body?.iceServers;
  // Our own STUN list is already in place; anything without credentials is one of theirs.
  const servers = (list || []).filter((s) => s?.urls && s?.username && s?.credential);
  if (!servers.length) throw new Error('no relay entries in response');
  return { servers, expiresAt: Date.now() + METERED_CACHE_MS + REFRESH_MARGIN_MS };
}

/** Cloudflare returns a single entry whose username and credential expire. */
async function cloudflareTurn() {
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.TURN_KEY_ID}/credentials/generate-ice-servers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TURN_KEY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: CREDENTIAL_TTL_SEC }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  // Documented as an object; tolerate an array in case that ever changes.
  const server = Array.isArray(body?.iceServers) ? body.iceServers[0] : body?.iceServers;
  if (!server?.urls || !server?.username) throw new Error('no credentials in response');
  return { servers: [server], expiresAt: Date.now() + CREDENTIAL_TTL_SEC * 1000 };
}

/** Cached until shortly before expiry, so a busy room does not re-fetch per join. */
async function fetchedTurn() {
  if (isFresh()) return cached.servers;
  try {
    cached = meteredConfigured() ? await meteredTurn() : await cloudflareTurn();
    return cached.servers;
  } catch (err) {
    // Same bargain as the database: degrade to what still works, do not take voice down.
    console.warn(`[ice] ${turnMode()} TURN credentials unavailable (${err.message}) - STUN only for now.`);
    return cached?.servers ?? []; // a stale credential still beats nothing
  }
}

/**
 * Fetch once at boot so a wrong key is reported immediately, rather than discovered
 * by the first person who tries to talk. Also warms the cache.
 */
export async function warmIce() {
  if (fetchedProvider()) await fetchedTurn();
}

/** Whether a relay is actually usable right now, as opposed to merely configured. */
export const turnReady = () =>
  fetchedProvider() ? Boolean(cached?.servers?.length) : staticConfigured();

/** Never throws. Returns STUN, plus a relay when one is configured and reachable. */
export async function iceServers() {
  const servers = [{ urls: STUN }];
  if (fetchedProvider()) {
    servers.push(...(await fetchedTurn()));
  } else if (staticConfigured()) {
    servers.push({
      urls: staticTurnUrls(),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
