import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOTS, checkShare, parseMeta, probeImage, readPageMeta } from './index.ts';

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
</head><body><script>document.title = 'changé par JS'</script></body></html>`;

let server: Server;
let base = '';
let lastHeaders: IncomingHttpHeaders = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    if (req.url === '/og.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png(800, 420));
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
    const meta = { ...parseMeta('<html><head></head></html>', 'https://x.dev/'), requestedUrl: '', finalUrl: '', status: 200, contentType: null, fetchedAs: 'whatsapp' as const, durationMs: 0 };
    const ids = checkShare(meta, null).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['title-missing', 'og-image-missing', 'viewport-missing', 'lang-missing']));
  });
});
