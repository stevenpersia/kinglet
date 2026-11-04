import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPageMeta, readSharePreviews, vercelBypassHeaders } from './index.ts';

/**
 * Behaves like a protected Vercel deployment: without the secret, 401; with
 * `x-vercel-set-bypass-cookie`, a redirect to itself that sets a cookie (fine for a browser,
 * a loop for a client without cookies); with the secret alone, the page.
 */
let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.headers['x-vercel-protection-bypass'] !== 'secret') {
      res.writeHead(401, { 'content-type': 'text/html' });
      return res.end('<html><head><title>Authentication Required</title></head></html>');
    }
    if (req.headers['x-vercel-set-bypass-cookie'] && !String(req.headers.cookie ?? '').includes('_vercel_jwt')) {
      res.writeHead(307, { location: req.url ?? '/', 'set-cookie': '_vercel_jwt=x; Path=/; HttpOnly' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html lang="fr"><head><title>Toolchains — Backslash</title><meta property="og:title" content="Toolchains"></head></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/extensions/toolchains`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const hosts = ['127.0.0.1'];

describe('Vercel protection bypass for bots', () => {
  it('only browsers get the cookie header', () => {
    expect(vercelBypassHeaders('https://x-git-a.vercel.app/', { secret: 's', browser: true })).toEqual({ 'x-vercel-protection-bypass': 's', 'x-vercel-set-bypass-cookie': 'true' });
    expect(vercelBypassHeaders('https://x-git-a.vercel.app/', { secret: 's' })).toEqual({ 'x-vercel-protection-bypass': 's' });
    expect(vercelBypassHeaders('https://maisonsable.fr/', { secret: 's' })).toEqual({});
    expect(vercelBypassHeaders('https://x.vercel.app/', { secret: null })).toEqual({});
  });

  it('the browser header sends a cookie-less client into a redirect loop, with an explicit error', async () => {
    const headers = vercelBypassHeaders(base, { secret: 'secret', hosts, browser: true });
    await expect(readPageMeta(base, { headers })).rejects.toThrow(/fetch failed: .*redirect/i);
  });

  it('bot headers read the protected page, for every platform', async () => {
    const headers = vercelBypassHeaders(base, { secret: 'secret', hosts });
    expect((await readPageMeta(base, { headers })).title).toBe('Toolchains — Backslash');
    const previews = await readSharePreviews(base, { headers });
    expect(previews.cards.every((c) => c.httpStatus === 200)).toBe(true);
  });
});
