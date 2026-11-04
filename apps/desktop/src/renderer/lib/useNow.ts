import { useEffect, useState } from 'react';

/** The current time, refreshed every `ms` (for "3 min ago" labels). */
export function useNow(ms = 20_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
