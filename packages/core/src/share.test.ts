import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildShareFix, detectFramework, guessSiteName, isAddedLine, parseMeta, readSharePreviews, setLanguage, type PageMeta } from './index.ts';

let server: Server;
let base = '';

/** PNG header only: enough for image-size. */
function pngHeader(w: number, h: number) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const ua = req.headers['user-agent'] ?? '';
    if (req.url === '/og.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(pngHeader(1200, 630));
    }
    if (ua.includes('LinkedInBot')) {
      res.writeHead(403);
      return res.end('blocked');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html lang="fr"><head>
<title>Un titre de page vraiment très long pour vérifier que Google le coupe bien — Maison Sable</title>
<meta name="description" content="Céramiques.">
<meta property="og:title" content="Maison Sable">
<meta property="og:description" content="Céramiques faites main.">
<meta property="og:image" content="${base}/og.png">
<meta name="theme-color" content="#2F5D50">
<script id="__NEXT_DATA__" type="application/json">{}</script>
</head><body></body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('readSharePreviews', () => {
  it('builds one card per platform, each from its own bot', async () => {
    const r = await readSharePreviews(`${base}/`);
    expect(r.framework).toBe('next');
    expect(r.cards.map((c) => c.platform)).toEqual(['whatsapp', 'imessage', 'slack', 'discord', 'linkedin', 'x', 'google']);
    const by = Object.fromEntries(r.cards.map((c) => [c.platform, c]));

    expect(by.linkedin).toMatchObject({ status: 'error', httpStatus: 403, layout: 'text' });
    expect(by.whatsapp).toMatchObject({ layout: 'large', title: 'Maison Sable', image: `${base}/og.png` });
    expect(by.slack!.siteName).toBe(new URL(base).host); // no og:site_name: the domain (with port in local)
    expect(by.slack!.problems.join()).toMatch(/og:site_name/);
    expect(by.discord!.accent).toBe('#2F5D50');
    expect(by.x).toMatchObject({ layout: 'small' });
    expect(by.x!.problems.join()).toMatch(/twitter:card/);
    expect(by.google).toMatchObject({ layout: 'serp', titleCut: true });
    expect(by.google!.title!.length).toBeLessThanOrEqual(60);
  });
});

describe('framework detection', () => {
  it.each([
    ['<script id="__NEXT_DATA__">', 'next'],
    ['<script src="/_next/static/chunks/main.js">', 'next'],
    ['<script>window.__NUXT__={}</script>', 'nuxt'],
    ['<meta name="generator" content="Astro v5">', 'astro'],
    ['<div data-sveltekit-preload-data>', 'sveltekit'],
    ['<script type="module" src="/@vite/client">', 'vite'],
    ['<p>hello</p>', 'html'],
  ])('%s → %s', (html, fw) => expect(detectFramework(html)).toBe(fw));
});

const metaFrom = (head: string, url = 'http://localhost:3000/'): PageMeta => ({
  ...parseMeta(`<html><head>${head}</head></html>`, url),
  requestedUrl: url,
  finalUrl: url,
  status: 200,
  contentType: 'text/html',
  fetchedAs: 'whatsapp',
  durationMs: 0,
  robotsHeader: null,
});

describe('buildShareFix', () => {
  it('guesses the site name from the title', () => {
    expect(guessSiteName(metaFrom('<title>Atelier — Maison Sable</title>', 'http://localhost:3000/atelier'))).toBe('Maison Sable');
    expect(guessSiteName(metaFrom('<title>Maison Sable — Céramiques faites main</title>'))).toBe('Maison Sable');
    expect(guessSiteName(metaFrom('<title>Céramiques — Maison Sable</title>', 'https://maisonsable.fr/'))).toBe('Maison Sable');
    expect(guessSiteName(metaFrom('<title>Accueil</title>', 'https://maisonsable.fr/'))).toBe('Maisonsable');
  });

  it('writes Next.js metadata with the missing fields marked, and a prompt', () => {
    const meta = metaFrom('<title>Atelier — Maison Sable</title><meta name="description" content="Desc"><meta property="og:image" content="/hero.jpg"><link rel="canonical" href="https://maisonsable.fr/atelier"><script id="__NEXT_DATA__"></script>', 'http://localhost:3000/atelier');
    const fix = buildShareFix(meta, { url: '', ok: true, status: 200, bytes: 1000, width: 800, height: 420, type: 'jpg', error: null });
    expect(fix.framework).toBe('next');
    expect(fix.code).toContain(`metadataBase: new URL('https://maisonsable.fr'),  // ← added`);
    expect(fix.code).toContain(`siteName: 'Maison Sable',  // ← added`);
    expect(fix.code).toContain(`images: [{ url: '/hero.jpg', width: 1200, height: 630 }],  // ← added`);
    expect(fix.changes).toEqual(expect.arrayContaining(['add og:site_name (“Maison Sable”)', 'make the image URL absolute', 'replace the 800×420 image with a 1200×630 one']));
    expect(fix.prompt).toContain('domain: https://maisonsable.fr');
    expect(fix.prompt).toContain('next/og');
  });

  it('writes HTML tags for a Vite site and asks for the domain when unknown', () => {
    const fix = buildShareFix(metaFrom('<title>Maison Sable</title><script type="module" src="/@vite/client"></script>'), null);
    expect(fix).toMatchObject({ framework: 'vite', language: 'html', file: 'index.html, in <head>' });
    expect(fix.code).toContain('<meta property="og:image" content="https://[YOUR-DOMAIN]/og.png"> <!-- ← added -->');
    expect(fix.prompt).toContain('ask me for the production domain');
  });

  it('writes the fix in French after setLanguage(\'fr\')', () => {
    setLanguage('fr');
    try {
      const fix = buildShareFix(metaFrom('<title>Maison Sable</title><script type="module" src="/@vite/client"></script>'), null);
      expect(fix.file).toBe('index.html, dans <head>');
      expect(fix.code).toContain('<meta property="og:image" content="https://[TON-DOMAINE]/og.png"> <!-- ← ajouté -->');
      expect(fix.changes).toContain('ajouter une image de partage 1200×630');
      expect(fix.prompt).toContain('demande-moi le domaine de production');
      expect(fix.code.split('\n').filter(isAddedLine).length).toBeGreaterThan(0);
    } finally {
      setLanguage('en');
    }
  });

  it('has nothing to say when everything is there', () => {
    const fix = buildShareFix(
      metaFrom('<title>A — B</title><meta name="description" content="d"><meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:site_name" content="B"><meta property="og:image" content="https://b.dev/og.png"><meta name="twitter:card" content="summary_large_image">', 'https://b.dev/'),
      { url: '', ok: true, status: 200, bytes: 1000, width: 1200, height: 630, type: 'png', error: null },
    );
    expect(fix.changes).toEqual([]);
    expect(fix.prompt).toBe('');
  });
});
