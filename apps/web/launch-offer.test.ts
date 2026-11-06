// The launch-price counter (functions/launch-offer.ts), without the network.
import { expect, it } from 'vitest';
import handler, { offerFrom, readOffer } from './functions/launch-offer';

const now = Date.parse('2026-12-01T12:00:00Z');

it('counts the launch-price licenses left, and stops when Polar would stop applying the discount', () => {
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 63 }, now)).toEqual({ left: 37, total: 100 });
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 0 }, now)).toEqual({ left: 100, total: 100 });
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 100 }, now)).toBe(null);
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 120 }, now)).toBe(null);
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 3, ends_at: '2026-11-30T00:00:00Z' }, now)).toBe(null);
  expect(offerFrom({ max_redemptions: 100, redemptions_count: 3, starts_at: '2026-12-02T00:00:00Z' }, now)).toBe(null);
  expect(offerFrom({ max_redemptions: null, redemptions_count: 3 }, now)).toBe(null);
});

it('reads the discount from Polar, and shows no offer when it cannot', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const polar = (status: number, body: unknown) => (async (u: string, init?: RequestInit) => { calls.push([u, init]); return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
  const env = { POLAR_ACCESS_TOKEN: 'tok', POLAR_DISCOUNT_ID: 'd1' } as NodeJS.ProcessEnv;
  expect(await readOffer(env, polar(200, { max_redemptions: 100, redemptions_count: 10 }), now)).toEqual({ left: 90, total: 100 });
  expect(calls[0][0]).toBe('https://api.polar.sh/v1/discounts/d1');
  expect(new Headers(calls[0][1]?.headers).get('authorization')).toBe('Bearer tok');
  expect(await readOffer({ ...env, POLAR_API: 'https://sandbox-api.polar.sh/' }, polar(200, {}), now)).toBe(null);
  expect(calls[1][0]).toBe('https://sandbox-api.polar.sh/v1/discounts/d1');
  expect(await readOffer(env, polar(401, { detail: 'no' }), now)).toBe(null);
  expect(await readOffer(env, (async () => { throw new Error('down'); }) as typeof fetch, now)).toBe(null);
  expect(await readOffer({} as NodeJS.ProcessEnv, polar(200, {}), now)).toBe(null);
});

it('answers GET with a short CDN cache, and refuses other methods', async () => {
  const res = await handler(new Request('https://x.dev/api/launch-offer'));
  expect(await res.json()).toEqual({ offer: null });
  expect(res.headers.get('cache-control')).toContain('s-maxage=30');
  expect((await handler(new Request('https://x.dev/api/launch-offer', { method: 'POST' }))).status).toBe(405);
});
