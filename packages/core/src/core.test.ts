import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOTS, CHECK_GROUPS, checkShare, crawl, parseMeta, parseRobots, parseSitemap, probeImage, readPageMeta, readSiteFiles, runChecks, score, setLanguage } from './index.ts';

/** Minimal valid PNG of the given size (grey pixels). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PAGE = `<!doctype html><html lang="fr"><head>
<title>Maison Sable — Céramiques faites main</title>
<meta name="description" content="Pièces uniques en grès.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Maison Sable">
<meta property="og:description" content="Céramiques">
<meta property="og:image" content="/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="manifest" href="/manifest.webmanifest">
</head><body><h1>Maison Sable</h1><img src="/a.jpg"><img src="/b.jpg" alt="Bol">
<a href="/atelier">Atelier</a> <a href="/collection#top">Collection</a> <a href="https://ailleurs.dev/">Ailleurs</a> <a href="/logo.png">Logo</a>
<script>document.title = 'changé par JS'</script></body></html>`;

const SUB = (title: string, links = '') => `<!doctype html><html><head><title>${title}</title></head><body>${links}</body></html>`;

let server: Server;
let base = '';
let lastHeaders: IncomingHttpHeaders = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    if (req.url === '/og.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png(800, 420));
    } else if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: Googlebot\nDisallow: /private\n\nUser-agent: *\nAllow: /\n\nSitemap: ' + base + '/sitemap.xml\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<urlset><url><loc>${base}/</loc></url><url><loc>${base}/journal</loc></url></urlset>`);
    } else if (req.url === '/manifest.webmanifest') {
      res.writeHead(200, { 'content-type': 'application/manifest+json' });
      res.end(JSON.stringify({ name: 'Maison Sable', icons: [{ src: '/icon.png' }] }));
    } else if (req.url === '/favicon.ico') {
      res.writeHead(200, { 'content-type': 'image/x-icon' });
      res.end('ico');
    } else if (req.url === '/atelier') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SUB('Atelier', '<a href="/atelier/tour">Visite</a>'));
    } else if (req.url === '/atelier/tour' || req.url === '/collection' || req.url === '/journal') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SUB(req.url.slice(1)));
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: '/' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('readPageMeta', () => {
  it('fetches as the WhatsApp bot and reads the raw HTML (no JS)', async () => {
    const meta = await readPageMeta(`${base}/`);
    expect(lastHeaders['user-agent']).toBe(BOTS.whatsapp);
    expect(meta.title).toBe('Maison Sable — Céramiques faites main');
    expect(meta.lang).toBe('fr');
    expect(meta.og['title']).toBe('Maison Sable');
    expect(meta.twitter['card']).toBe('summary_large_image');
    expect(meta.icons).toEqual([`${base}/favicon.ico`]);
    expect(meta.ogImageUrl).toBe(`${base}/og.png`);
    expect(meta.ogImageIsRelative).toBe(true);
  });

  it('forwards extra headers such as the Vercel protection bypass', async () => {
    await readPageMeta(`${base}/`, { headers: { 'x-vercel-protection-bypass': 'secret123' } });
    expect(lastHeaders['x-vercel-protection-bypass']).toBe('secret123');
  });

  it('follows redirects and reports the final URL', async () => {
    const meta = await readPageMeta(`${base}/redirect`, { bot: 'slack' });
    expect(meta.finalUrl).toBe(`${base}/`);
    expect(lastHeaders['user-agent']).toBe(BOTS.slack);
  });
});

describe('probeImage + checkShare', () => {
  it('flags the missing site name, the relative and undersized image', async () => {
    const meta = await readPageMeta(`${base}/`);
    const image = await probeImage(meta.ogImageUrl!);
    expect(image).toMatchObject({ ok: true, width: 800, height: 420, type: 'png' });
    const ids = checkShare(meta, image).map((i) => i.id);
    expect(ids).toContain('og-site-name-missing');
    expect(ids).toContain('og-image-relative');
    expect(ids).toContain('og-image-small');
    expect(ids).not.toContain('viewport-missing');
    expect(ids).not.toContain('title-missing');
  });

  it('reports a page without tags', () => {
    const meta = { ...parseMeta('<html><head></head></html>', 'https://x.dev/'), requestedUrl: '', finalUrl: '', status: 200, contentType: null, fetchedAs: 'whatsapp' as const, durationMs: 0, robotsHeader: null };
    const ids = checkShare(meta, null).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['title-missing', 'og-image-missing', 'viewport-missing', 'lang-missing']));
  });
});

describe('site files', () => {
  it('parses robots.txt groups and sitemaps', () => {
    expect(parseRobots('User-agent: *\nDisallow: /\nSitemap: https://x.dev/s.xml')).toEqual({ disallowAll: true, sitemaps: ['https://x.dev/s.xml'] });
    expect(parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /').disallowAll).toBe(false);
  });

  it('reads <loc> entries', () => {
    expect(parseSitemap('<urlset><url><loc> https://x.dev/a?b=1&amp;c=2 </loc></url></urlset>')).toEqual(['https://x.dev/a?b=1&c=2']);
  });

  it('fetches robots, sitemap, manifest and favicon', async () => {
    const meta = await readPageMeta(`${base}/`);
    const site = await readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null });
    expect(site.robots).toMatchObject({ status: 200, disallowAll: false });
    expect(site.sitemap?.urls).toHaveLength(2);
    expect(site.manifest).toMatchObject({ status: 200, name: 'Maison Sable', icons: 1, error: null });
    expect(site.favicon?.status).toBe(200);
  });
});

describe('dev-server fallback pages', () => {
  it('treats an HTML answer to /robots.txt or the favicon as missing', async () => {
    const spa = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>SPA</title></head><body></body></html>');
    });
    await new Promise<void>((r) => spa.listen(0, '127.0.0.1', r));
    const port = (spa.address() as { port: number }).port;
    const site = await readSiteFiles(`http://127.0.0.1:${port}/`, { manifest: null, favicon: null });
    spa.close();
    expect(site.robots?.status).toBe(404);
    expect(site.sitemap?.urls).toEqual([]);
    expect(site.favicon?.status).toBe(404);
  });
});

describe('crawl', () => {
  it('explores same-origin pages, skips assets, fragments and other sites, adds seeds', async () => {
    const pages = await crawl(`${base}/`, { seeds: [`${base}/journal`] });
    expect(pages.map((p) => p.path)).toEqual(['/', '/atelier', '/atelier/tour', '/collection', '/journal']);
    expect(pages.find((p) => p.path === '/atelier')?.title).toBe('Atelier');
  });

  it('stops at the limit', async () => {
    expect(await crawl(`${base}/`, { limit: 2 })).toHaveLength(2);
  });
});

describe('runChecks', () => {
  it('produces the 37 checks and scores what can be measured', async () => {
    const meta = await readPageMeta(`${base}/`);
    const image = await probeImage(meta.ogImageUrl!);
    const site = await readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null });
    const rendered = [
      {
        id: 'iphone',
        label: 'iPhone',
        overflowPx: 24,
        consoleErrors: ['TypeError: x is undefined'],
        heavyImages: [],
        touch: true,
        smallTargets: { count: 2, examples: ['a « ✕ »'] },
        smallText: { count: 0, minPx: 0, examples: [] },
        lowContrast: { count: 1, examples: ['« mentions » 2.1:1'] },
        notchUnsafe: false,
        vitals: { lcpMs: 3100, cls: 0.02, fcpMs: 900, ttfbMs: 40 },
      },
    ];
    const results = runChecks({ meta, image, site, rendered });
    expect(results).toHaveLength(37);
    expect(Object.fromEntries(results.map((r) => [r.id, r.status]))).toMatchObject({ 'tap-targets': 'warning', 'small-text': 'ok', contrast: 'warning', 'safe-area': 'ok', lcp: 'warning', cls: 'ok' });
    expect(results.find((r) => r.id === 'lcp')!.detail).toBe('3.1 s on iPhone (good under 2.5 s).');
    const by = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(by).toMatchObject({ h1: 'ok', robots: 'ok', sitemap: 'ok', manifest: 'ok', 'og-site-name': 'warning', overflow: 'error', console: 'error', 'img-alt': 'warning', 'heavy-images': 'ok' });
    // structured-data and hreflang are info (one language, no JSON-LD); text zoom and accessibility need the devices.
    expect(score(results).total).toBe(32);
    expect(runChecks({ meta, image, site: null }).filter((r) => r.status === 'skip').map((r) => r.id)).toEqual(
      expect.arrayContaining(['robots', 'sitemap', 'overflow', 'console', 'heavy-images', 'favicon', 'tap-targets', 'small-text', 'contrast', 'safe-area', 'lcp', 'cls', 'text-zoom', 'a11y-serious', 'a11y-minor', 'focus-visible', 'forms']),
    );
  });

  it('accepts noindex outside production only', () => {
    const base = { ...parseMeta('<html><head><meta name="robots" content="noindex"></head></html>', 'https://x.dev/'), requestedUrl: '', status: 200, contentType: null, fetchedAs: 'google' as const, durationMs: 0, robotsHeader: null };
    const idx = (url: string) => runChecks({ meta: { ...base, finalUrl: url }, image: null, site: null }).find((r) => r.id === 'indexing')!.status;
    expect(idx('https://maisonsable.fr/')).toBe('error');
    expect(idx('https://maison-sable-git-feat.vercel.app/')).toBe('info');
    expect(idx('http://localhost:3000/')).toBe('info');
  });

  it('speaks English by default and French after setLanguage(\'fr\'), switching at runtime', () => {
    const meta = { ...parseMeta('<html><head></head><body><img src="a.png"><img src="b.png"></body></html>', 'https://x.dev/'), finalUrl: 'https://x.dev/', requestedUrl: 'https://x.dev/', status: 200, contentType: null, fetchedAs: 'google' as const, durationMs: 0, robotsHeader: null };
    const rendered = [{ id: 'iphone', label: 'iPhone', overflowPx: 24, consoleErrors: [], heavyImages: [] }];
    const get = (id: string) => runChecks({ meta, image: null, site: null, rendered }).find((r) => r.id === id)!;
    expect(get('title')).toMatchObject({ label: 'Page title', detail: 'No <title>.' });
    expect(get('img-alt').detail).toBe('2 of 2 images without alt.');
    expect(get('overflow').detail).toBe('iPhone: +24 px');
    expect(CHECK_GROUPS.map((g) => g.label)).toEqual(['SEO', 'Share', 'Mobile', 'Accessibility', 'Technical']);
    setLanguage('fr');
    try {
      expect(get('title')).toMatchObject({ label: 'Titre de la page', detail: 'Pas de <title>.' });
      expect(get('img-alt').detail).toBe('2 images sur 2 sans alt.');
      expect(get('overflow').detail).toBe('iPhone : +24 px');
      expect(CHECK_GROUPS.map((g) => g.label)).toEqual(['SEO', 'Partage', 'Mobile', 'Accessibilité', 'Technique']);
      expect(checkShare(meta).find((i) => i.id === 'og-image-missing')!.message).toBe('Pas d’image de partage : l’aperçu sera du texte seul.');
    } finally {
      setLanguage('en');
    }
    expect(checkShare(meta).find((i) => i.id === 'og-image-missing')!.message).toBe('No share image: the preview will be text only.');
  });
});

describe('resolveLanguage', () => {
  it('follows the computer for "system"', async () => {
    const { resolveLanguage } = await import('./index.ts');
    expect(resolveLanguage('fr', 'en-US')).toBe('fr');
    expect(resolveLanguage('system', 'fr-CA')).toBe('fr');
    expect(resolveLanguage('system', 'de-DE')).toBe('en');
    expect(resolveLanguage(undefined, null)).toBe('en');
  });
});
