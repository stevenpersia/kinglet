// The launch list endpoint (functions/waitlist.ts), without the network.
import { expect, it } from 'vitest';
import { POST, validEmail, addContact } from './functions/waitlist';
it('adds valid emails to the Resend audience and refuses the rest', async () => {
  expect(validEmail(' A@B.co ')).toBe('a@b.co');
  expect(validEmail('nope')).toBe(null);
  let r = await POST(new Request('https://x.dev/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad' }) }));
  expect(r.status).toBe(400);
  r = await POST(new Request('https://x.dev/api/waitlist', { method: 'POST', body: new URLSearchParams({ email: 'bad' }) }));
  expect(r.status).toBe(303); expect(r.headers.get('location')).toBe('https://x.dev/?waitlist=invalid#waitlist');
  r = await POST(new Request('https://x.dev/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', website: 'spam' }) }));
  expect((await r.json()).ok).toBe(true);
  const calls: [string, RequestInit][] = [];
  const ok = await addContact('a@b.co', { RESEND_API_KEY: 'k', RESEND_AUDIENCE_ID: 'aud' } as NodeJS.ProcessEnv, (async (u: string, init: RequestInit) => { calls.push([u, init]); return new Response('{}', { status: 409 }); }) as typeof fetch);
  expect(ok).toBe(true); expect(calls[0][0]).toBe('https://api.resend.com/audiences/aud/contacts');
  r = await POST(new Request('https://x.dev/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }) }));
  expect(r.status).toBe(502);
});
