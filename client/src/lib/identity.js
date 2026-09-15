const KEY = 'ipl-auction:identity';
/** A second seat taken in this tab, so one browser can hold two people. */
const TAB_KEY = 'ipl-auction:tab-player';
const TAB_PROFILE = 'ipl-auction:tab-profile';

const newId = () =>
  globalThis.crypto?.randomUUID?.() || `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode - identity just won't survive a refresh */
  }
}

function readTabPlayerId() {
  try {
    return sessionStorage.getItem(TAB_KEY) || null;
  } catch {
    return null;
  }
}

function readTabProfile() {
  try {
    return JSON.parse(sessionStorage.getItem(TAB_PROFILE) || '{}');
  } catch {
    return {};
  }
}

/**
 * Stable per-browser id, so a refresh reconnects you to your own team and purse.
 *
 * A tab can override it with a second id (see forkIdentity). That is what lets you
 * open your own invite link in another tab and sit down as a genuinely different
 * person, instead of silently taking back the seat you already hold.
 */
export function getIdentity() {
  const stored = read();
  if (!stored.playerId) {
    stored.playerId = newId();
    write(stored);
  }
  const tabPlayerId = readTabPlayerId();
  if (!tabPlayerId) return { name: '', teamName: '', ...stored };
  // A forked tab keeps its own name and franchise so it does not rewrite the
  // primary identity sitting in the other tab.
  return { name: '', teamName: '', ...stored, ...readTabProfile(), playerId: tabPlayerId };
}

/** Become a separate person for the life of this tab. Survives a refresh, not a close. */
export function forkIdentity() {
  const id = newId();
  try {
    sessionStorage.setItem(TAB_KEY, id);
  } catch {
    /* without sessionStorage this tab simply stays the same person */
  }
  return { ...getIdentity(), playerId: id };
}

/** Name and franchise are remembered for next time; the id is never patched from outside. */
export function saveIdentity(patch = {}) {
  const { playerId, ...rest } = patch;
  if (readTabPlayerId()) {
    try {
      sessionStorage.setItem(TAB_PROFILE, JSON.stringify({ ...readTabProfile(), ...rest }));
    } catch {
      /* nothing to remember without sessionStorage */
    }
  } else {
    write({ ...read(), ...rest });
  }
  return getIdentity();
}

export const rememberRoom = (code) => saveIdentity({ lastRoom: code });
