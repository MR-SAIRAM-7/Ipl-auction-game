/**
 * Auction sound: effects and a live announcer.
 *
 * Everything here is synthesised at runtime. There are no audio files, because the
 * app has to announce whichever player comes up - there is no way to ship a clip for
 * every name on the roster, and a 115-file bundle would dwarf the rest of the client.
 *
 *   Effects   - short tones built with the Web Audio API: a gavel on a sale, a rising
 *               pair on a bid, a flat buzz when a lot goes unsold.
 *   Announcer - the browser's own speech synthesis, so "Rohit Sharma, sold to Mumbai
 *               Titans" is spoken aloud whoever the player turns out to be.
 *
 * Browsers refuse to start audio until the user has interacted with the page, so
 * nothing here throws or warns if it is blocked - it simply does not play. `unlock()`
 * is called from the first real click and quietly enables the rest.
 */

let ctx = null;
let unlocked = false;
let muted = false;

/** Speech is the part people tire of first, so it is tracked separately from effects. */
let speechOn = true;

const STORAGE_KEY = 'auction-sound';

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (typeof saved.muted === 'boolean') muted = saved.muted;
  if (typeof saved.speech === 'boolean') speechOn = saved.speech;
} catch {
  // Private windows and blocked storage are fine; the defaults above stand.
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, speech: speechOn }));
  } catch {
    /* not worth surfacing */
  }
}

function audioCtx() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  return ctx;
}

/** Call from any genuine user gesture. Safe to call repeatedly. */
export function unlock() {
  if (unlocked) return;
  const c = audioCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

export const isMuted = () => muted;
export const isSpeechOn = () => speechOn && !muted;

export function setMuted(next) {
  muted = Boolean(next);
  if (muted) stopSpeaking();
  persist();
}

export function setSpeech(next) {
  speechOn = Boolean(next);
  if (!speechOn) stopSpeaking();
  persist();
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

/**
 * One shaped tone. `type` picks the timbre, and the gain envelope is what stops it
 * sounding like a test signal - a fast attack and an exponential tail.
 */
function tone({ freq, start = 0, duration = 0.18, type = 'sine', gain = 0.16, sweepTo = null }) {
  const c = audioCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const amp = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);

  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Filtered noise burst - the wooden crack under the gavel. */
function knock({ start = 0, duration = 0.14, gain = 0.3 } = {}) {
  const c = audioCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Decaying noise reads as a hit rather than a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  }
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  src.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1100, t0);
  amp.gain.setValueAtTime(gain, t0);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  /** A paddle goes up. Two quick rising notes. */
  bid() {
    tone({ freq: 620, duration: 0.08, type: 'triangle', gain: 0.1 });
    tone({ freq: 880, start: 0.06, duration: 0.1, type: 'triangle', gain: 0.09 });
  },
  /** Someone outbid you - same shape, inverted, so it reads as a warning. */
  outbid() {
    tone({ freq: 520, duration: 0.1, type: 'sawtooth', gain: 0.07, sweepTo: 360 });
  },
  /** Hammer down. Wooden knock, then a bright confirming third. */
  sold() {
    knock({ gain: 0.34 });
    knock({ start: 0.1, gain: 0.2 });
    tone({ freq: 784, start: 0.18, duration: 0.22, type: 'sine', gain: 0.14 });
    tone({ freq: 1175, start: 0.26, duration: 0.3, type: 'sine', gain: 0.1 });
  },
  /** Nobody bid. A flat, deliberately unsatisfying pair. */
  unsold() {
    knock({ gain: 0.22 });
    tone({ freq: 300, start: 0.12, duration: 0.26, type: 'sawtooth', gain: 0.09, sweepTo: 200 });
  },
  /** A new lot arrives. */
  lot() {
    tone({ freq: 523, duration: 0.14, type: 'sine', gain: 0.1 });
    tone({ freq: 659, start: 0.1, duration: 0.18, type: 'sine', gain: 0.09 });
  },
  /** A marquee name is up. Worth its own fanfare. */
  marquee() {
    tone({ freq: 523, duration: 0.14, type: 'triangle', gain: 0.12 });
    tone({ freq: 659, start: 0.11, duration: 0.14, type: 'triangle', gain: 0.12 });
    tone({ freq: 784, start: 0.22, duration: 0.16, type: 'triangle', gain: 0.13 });
    tone({ freq: 1047, start: 0.34, duration: 0.42, type: 'sine', gain: 0.12 });
  },
  /** Final ten seconds. */
  tick() {
    tone({ freq: 1000, duration: 0.05, type: 'square', gain: 0.045 });
  },
  /** The auction is over. */
  finish() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, start: i * 0.13, duration: 0.34, type: 'sine', gain: 0.12 }),
    );
  },
};

/* ------------------------------------------------------------------ */
/* Announcer                                                           */
/* ------------------------------------------------------------------ */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

/** Prefer an Indian English voice, then any English one, then whatever exists. */
function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  if (!voices.length) return null;
  return (
    voices.find((v) => /en[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /en[-_]GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  );
}

export function stopSpeaking() {
  try {
    synth?.cancel();
  } catch {
    /* nothing to cancel */
  }
}

/**
 * Speaks a line, dropping anything already queued so the announcer always describes
 * what is happening NOW rather than working through a backlog of stale lots.
 */
export function announce(text, { rate = 1.02, pitch = 1, interrupt = true } = {}) {
  if (!synth || !isSpeechOn() || !text) return;
  try {
    if (interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 240));
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 0.95;
    synth.speak(u);
  } catch {
    /* speech is a flourish, never a requirement */
  }
}

/* ------------------------------------------------------------------ */
/* Composed moments                                                    */
/* ------------------------------------------------------------------ */

/** A player comes under the hammer. Marquee names get the bigger fanfare. */
export function announceLot(player, { marquee = false, setLabel = null } = {}) {
  if (!player) return;
  if (marquee) sfx.marquee();
  else sfx.lot();
  const intro = marquee ? 'Marquee lot. ' : setLabel ? `${setLabel}. ` : '';
  announce(`${intro}${player.name}. ${player.role}${player.overseas ? ', overseas' : ''}.`);
}

/** Hammer down, with the price. */
export function announceSold(player, teamName, priceText) {
  sfx.sold();
  announce(`Sold. ${player?.name} to ${teamName} for ${priceText}.`, { rate: 1.04 });
}

export function announceUnsold(player) {
  sfx.unsold();
  announce(`${player?.name} goes unsold.`, { rate: 1.0 });
}
