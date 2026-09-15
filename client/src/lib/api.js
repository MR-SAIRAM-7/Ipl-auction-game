/**
 * Resolves the backend origin. During `vite dev` the client runs on :5173 and the
 * API on :5000 - including when a phone opens it over the LAN, which is why we key
 * off window.location.hostname rather than hardcoding localhost.
 */
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (window.location.port === '5173'
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin);

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const getConfig = () => request('/config');
export const createRoom = (payload) => request('/rooms', { method: 'POST', body: JSON.stringify(payload) });
/** Room summary plus the franchises already in it, for the join screen. */
export const getRoom = (code) => request(`/rooms/${encodeURIComponent(code)}`);
