import { useEffect, useRef, useState } from 'react';

/**
 * Counts down to a server timestamp. The server owns the clock, so we only ever
 * render the remainder - no client-side drift can change when a lot actually closes.
 */
export function useCountdown(endsAt, active = true) {
  const [ms, setMs] = useState(() => Math.max(0, (endsAt || 0) - Date.now()));
  const raf = useRef(null);

  useEffect(() => {
    if (!endsAt || !active) {
      setMs(0);
      return undefined;
    }
    let last = 0;
    const tick = (ts) => {
      raf.current = requestAnimationFrame(tick);
      if (ts - last < 100) return;
      last = ts;
      setMs(Math.max(0, endsAt - Date.now()));
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [endsAt, active]);

  return { ms, seconds: Math.ceil(ms / 1000) };
}
