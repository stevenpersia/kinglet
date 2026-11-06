import { useEffect, useState } from 'react';
import { LAUNCH_API, LAUNCHED } from './config';

/** What /api/launch-offer answers (functions/launch-offer.ts): launch-price licenses left, out of how many, until when. */
export type LaunchOffer = { left: number; total: number; endsAt: string | null };

// One request per page, shared by every price on it (hero, pricing, footer).
let pending: Promise<LaunchOffer | null> | null = null;

function load(): Promise<LaunchOffer | null> {
  pending ??= fetch(LAUNCH_API)
    .then((res) => (res.ok ? (res.json() as Promise<{ offer?: LaunchOffer | null }>) : null))
    .then((body) => (body?.offer && body.offer.left > 0 ? body.offer : null))
    .catch(() => null);
  return pending;
}

/**
 * The launch offer while it lasts, after launch. The prerendered page (and a page without JavaScript)
 * shows the full price: never a lower price than Polar would charge.
 */
export function useLaunchOffer(): LaunchOffer | null {
  const [offer, setOffer] = useState<LaunchOffer | null>(null);
  useEffect(() => {
    if (!LAUNCHED) return;
    let live = true;
    void load().then((o) => live && setOffer(o));
    return () => {
      live = false;
    };
  }, []);
  return offer;
}
