import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditSite, auditPrompt, checkExternalLinks } from './index.ts';

describe('external links', () => {
  let other: Server;
  let site: Server;
  let ext = '';
  let base = '';
  const heads: string[] = [];
  beforeAll(async () => {
    other = createServer((req, res) => {
      if (req.method === 'HEAD') heads.push(req.url!);
      if (req.url === '/ok') return res.writeHead(200).end('ok');
      if (req.url === '/moved') return res.writeHead(301, { location: '/ok' }).end();
      // Answers HEAD badly, GET fine.
      if (req.url === '/no-head') return res.writeHead(req.method === 'HEAD' ? 405 : 200).end();
      if (req.url === '/wall') return res.writeHead(403).end();
      if (req.url === '/linkedin') return res.writeHead(999).end();
      if (req.url === '/gone') return res.writeHead(410).end();
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => other.listen(0, '127.0.0.1', r));
    ext = `http://localhost:${(other.address() as { port: number }).port}`;
    site = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      const links = ['/ok', '/moved', '/no-head', '/wall', '/gone', '/missing'].map((p) => `<a href="${ext}${p}">x</a>`).join('');
      if (req.url === '/') return res.end(`<html><head><title>A</title></head><body>${links}<a href="/b">B</a></body></html>`);
      res.end(`<html><head><title>B</title></head><body><a href="${ext}/missing#top">x</a><a href="${ext}/linkedin">in</a></body></html>`);
    });
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  });
  afterAll(() => {
    other.close();
    site.close();
  });

  it('tells broken links from the ones a site refuses to show to bots', async () => {
    const a = await auditSite(`${base}/`);
    expect(a.external!.found).toBe(7);
    expect(a.external!.broken.map((b) => [b.url.replace(ext, ''), b.status, b.from])).toEqual([
      ['/missing', 404, ['/', '/b']],
      ['/gone', 410, ['/']],
    ]);
    expect(a.external!.unverified.map((b) => [b.url.replace(ext, ''), b.status])).toEqual([
      ['/linkedin', 999],
      ['/wall', 403],
    ]);
    expect(heads).toContain('/no-head');
    expect(auditPrompt(a)).toContain(`- Broken external link → ${ext}/missing (HTTP 404), linked from /, /b`);
  });

  it('says when a domain does not exist, and can be turned off', async () => {
    const r = await checkExternalLinks(new Map([['http://kinglet-nope.invalid/', new Set(['/'])]]), { timeoutMs: 3000 });
    expect(r.checked).toBe(1);
    expect([...r.broken, ...r.unverified][0]!.error).toMatch(/domain not found|timed out|getaddrinfo/);
    expect((await auditSite(`${base}/`, { external: false })).external).toBeUndefined();
  });
});
