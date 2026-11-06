// Vercel Edge function (served at /api/launch-offer, packaged by scripts/build.mjs): how many launch-price licenses are left.
// It reads the Polar discount preset on the checkout link (at most LAUNCH_SEATS redemptions, no end date), so the site
// shows "37 of 100 left" and the launch price only while Polar would really apply it.
// Env (Vercel project settings): POLAR_ACCESS_TOKEN (organization access token, scope discounts:read), POLAR_DISCOUNT_ID.
// POLAR_API overrides https://api.polar.sh (the sandbox, for tests).

export type LaunchOffer = { left: number; total: number };

type PolarDiscount = { max_redemptions?: number | null; redemptions_count?: number | null; starts_at?: string | null; ends_at?: string | null };

/** The offer while it still applies, null once it's over or when it can't be read (the site then shows the full price). */
export function offerFrom(discount: PolarDiscount, now = Date.now()): LaunchOffer | null {
  const total = discount.max_redemptions;
  if (typeof total !== 'number' || total <= 0) return null;
  // The offer has no end date; these only mirror Polar, which ignores a discount outside its dates.
  if (discount.starts_at && Date.parse(discount.starts_at) > now) return null;
  if (discount.ends_at && Date.parse(discount.ends_at) <= now) return null;
  const left = Math.max(0, total - (discount.redemptions_count ?? 0));
  return left > 0 ? { left, total } : null;
}

export async function readOffer(env = process.env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<LaunchOffer | null> {
  const token = env.POLAR_ACCESS_TOKEN;
  const id = env.POLAR_DISCOUNT_ID;
  if (!token || !id) {
    console.error('launch-offer: POLAR_ACCESS_TOKEN or POLAR_DISCOUNT_ID is missing');
    return null;
  }
  const api = (env.POLAR_API ?? 'https://api.polar.sh').replace(/\/$/, '');
  try {
    const res = await fetcher(`${api}/v1/discounts/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    if (!res.ok) {
      console.error('launch-offer: Polar answered', res.status, await res.text().catch(() => ''));
      return null;
    }
    return offerFrom((await res.json()) as PolarDiscount, now);
  } catch (err) {
    console.error('launch-offer: Polar unreachable', err);
    return null;
  }
}

/** Edge entry point. Cached 30 s on Vercel's CDN so a busy launch doesn't hit Polar on every visit. */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const offer = await readOffer();
  return Response.json({ offer }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
}
