export const LAKH = 100000;
export const CRORE = 10000000;

export function formatINR(value) {
  const v = Number(value) || 0;
  if (v >= CRORE) return `₹${(v / CRORE).toFixed(2)} Cr`;
  if (v >= LAKH) {
    const l = v / LAKH;
    return `₹${Number.isInteger(l) ? l : l.toFixed(2)} L`;
  }
  if (v >= 1000) return `₹${Math.round(v / 1000)}K`;
  return `₹${v}`;
}

export function formatShort(value) {
  const v = Number(value) || 0;
  if (v >= CRORE) return `${(v / CRORE).toFixed(1)}Cr`;
  if (v >= LAKH) return `${(v / LAKH).toFixed(1)}L`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return `${v}`;
}

/** Seconds as m:ss once we are past a minute, plain seconds below it. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A lot length in words, for the lobby settings. */
export function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)} min ${s % 60}s`;
}

export const ROLE_SHORT = {
  Batter: 'BAT',
  Bowler: 'BOWL',
  'All-rounder': 'AR',
  'Wicket-keeper': 'WK',
};

/**
 * Readable ink for a franchise colour. Team colours are picked by players, so a
 * light pick like amber needs dark text rather than the white we use on navy.
 */
export function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  const int = parseInt(m[1], 16);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255);
  return luminance > 0.42 ? '#121214' : '#ffffff';
}

export const metricLabel = (key) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(' And ', ' & ')
    .trim();

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
