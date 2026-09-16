/**
 * ICE configuration for the voice mesh.
 *
 * STUN only tells a peer its own public address. That is enough when at least one
 * side sits behind a permissive NAT, which is typical on home wifi.
 *
 * Mobile carriers use CGNAT, which is symmetric: the port a peer sees is not the
 * port anyone else can reach. Two phones on mobile data therefore have no direct
 * path at all, and only a TURN server - which relays the audio - will connect them.
 *
 * Two ways to supply one, checked in this order:
 *
 * 1. Cloudflare Realtime (TURN_KEY_ID + TURN_KEY_API_TOKEN). Has much the largest
 *    free allowance, but issues only short-lived credentials, so we mint them here
 *    and hand them to the client through /api/config.
 * 2. A static relay (TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL). Anything else -
 *    self-hosted coturn, Metered, Xirsys - works this way.
 *
 * With neither, voice still works between peers that can reach each other directly.
 */

const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
];

/** Comfortably longer than an auction, so one mint covers a whole session. */
const CREDENTIAL_TTL_SEC = 4 * 60 * 60;
/** Re-mint this far before expiry rather than handing out a nearly-dead credential. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
/** Cloudflare being slow must not hold up the config request the whole app waits on. */
const MINT_TIMEOUT_MS = 5000;

const staticTurnUrls = () =>
  (process.env.TURN_URLS || process.env.TURN_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const cloudflareConfigured = () =>
  Boolean(process.env.TURN_KEY_ID) && Boolean(process.env.TURN_KEY_API_TOKEN);

/** A static relay is only usable if it has credentials to go with it. */
const staticConfigured = () =>
  staticTurnUrls().length > 0 && Boolean(process.env.TURN_USERNAME) && Boolean(process.env.TURN_CREDENTIAL);

export const turnMode = () =>
  cloudflareConfigured() ? 'cloudflare' : staticConfigured() ? 'static' : 'none';

let minted = null; // { server, expiresAt }

/**
 * Cloudflare hands back one iceServers entry with a username and credential that
 * expire. Cached until shortly before it does, so a busy room does not mint per join.
 */
async function cloudflareTurn() {
  if (minted && Date.now() < minted.expiresAt - REFRESH_MARGIN_MS) return minted.server;
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.TURN_KEY_ID}/credentials/generate-ice-servers`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: CREDENTIAL_TTL_SEC }),
      signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    // Documented as an object; tolerate an array in case that ever changes.
    const server = Array.isArray(body?.iceServers) ? body.iceServers[0] : body?.iceServers;
    if (!server?.urls || !server?.username) throw new Error('no credentials in response');
    minted = { server, expiresAt: Date.now() + CREDENTIAL_TTL_SEC * 1000 };
    return server;
  } catch (err) {
    // Same bargain as the database: degrade to what still works, do not take voice down.
    console.warn(`[ice] Cloudflare TURN credentials unavailable (${err.message}) - STUN only for now.`);
    return minted?.server ?? null; // a stale credential still beats nothing
  }
}

/**
 * Mint once at boot so a wrong Cloudflare key is reported immediately, rather than
 * discovered by the first person who tries to talk. Also warms the cache.
 */
export async function warmIce() {
  if (cloudflareConfigured()) await cloudflareTurn();
}

/** Whether a relay is actually usable right now, as opposed to merely configured. */
export const turnReady = () => (cloudflareConfigured() ? Boolean(minted) : staticConfigured());

/** Never throws. Returns STUN, plus a relay when one is configured and reachable. */
export async function iceServers() {
  const servers = [{ urls: STUN }];
  if (cloudflareConfigured()) {
    const turn = await cloudflareTurn();
    if (turn) servers.push(turn);
  } else if (staticConfigured()) {
    servers.push({
      urls: staticTurnUrls(),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
