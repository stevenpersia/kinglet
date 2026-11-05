import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FormsSummary } from './index.ts';
import { auditSite, checkHreflangTags, describeFailures, evaluateBudgets, parseMeta, pathMatches, readHreflang, readPageMeta, readStructuredData, runChecks } from './index.ts';

const meta = (html: string, url = 'https://x.dev/') => ({ ...parseMeta(html, url), finalUrl: url, requestedUrl: url, status: 200, contentType: 'text/html', fetchedAs: 'google' as const, durationMs: 0, robotsHeader: null });

describe('structured data', () => {
  const ld = (o: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;

  it('validates required properties and builds the rich preview', () => {
    const m = meta(
      ld({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Product', name: 'Bol', image: 'https://x.dev/bol.jpg', offers: { '@type': 'Offer', price: '42', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }, aggregateRating: { ratingValue: 4.6, reviewCount: 18 } },
          { '@type': 'BreadcrumbList', itemListElement: [{ position: 2, name: 'Bols' }, { position: 1, name: 'Boutique' }] },
          { '@type': 'Article' },
        ],
      }),
    );
    const sd = readStructuredData(m.jsonLd, m.jsonLdErrors);
    expect(sd.items.map((i) => [i.kind, i.missing])).toEqual([
      ['product', []],
      ['breadcrumb', []],
      ['article', ['headline']],
    ]);
    expect(sd.preview.breadcrumb).toEqual(['Boutique', 'Bols']);
    expect(sd.preview.rating).toEqual({ value: 4.6, count: 18, best: 5 });
    expect(sd.preview.price).toBe('€42.00');
    expect(sd.preview.availability).toBe('In stock');
    expect(runChecks({ meta: m, image: null, site: null }).find((c) => c.id === 'structured-data')).toMatchObject({ status: 'error', detail: 'Article: missing headline.' });
  });

  it('reports invalid JSON and FAQ entries without answers', () => {
    const bad = meta('<script type="application/ld+json">{ "@type": "Product", }</script>');
    expect(runChecks({ meta: bad, image: null, site: null }).find((c) => c.id === 'structured-data')!.status).toBe('error');
    const faq = meta(ld({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Délais ?' }] }));
    expect(readStructuredData(faq.jsonLd).items[0]!.missing).toContain('mainEntity[].name / acceptedAnswer.text');
    expect(runChecks({ meta: meta('<html></html>'), image: null, site: null }).find((c) => c.id === 'structured-data')!.status).toBe('info');
  });
});

describe('hreflang', () => {
  const alt = (lang: string, href: string) => `<link rel="alternate" hreflang="${lang}" href="${href}">`;

  it('checks codes, self-reference and x-default from the tags', () => {
    const m = meta(`<html lang="fr"><head>${alt('en-UK', 'https://x.dev/en')}${alt('de', '/de')}</head></html>`, 'https://x.dev/fr');
    const msgs = checkHreflangTags(m).map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining(['“en-UK” is not a valid code: use en-GB.', 'The page does not list itself among its hreflang alternates.', 'No x-default: visitors in other languages get no fallback.']));
    const good = meta(`<html lang="fr"><head>${alt('fr', 'https://x.dev/fr')}${alt('en', 'https://x.dev/en')}${alt('x-default', 'https://x.dev/en')}</head></html>`, 'https://x.dev/fr');
    expect(checkHreflangTags(good)).toEqual([]);
  });

  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(req.url === '/gone' ? 404 : 200, { 'content-type': 'text/html' });
      const links = (self: string, others: string[]) => [self, ...others].map((p) => alt(p.slice(1) || 'x-default', `${base}${p}`)).join('');
      if (req.url === '/fr') return res.end(`<html lang="fr"><head>${links('/fr', ['/en', '/de'])}</head></html>`);
      if (req.url === '/en') return res.end(`<html lang="en"><head>${links('/en', ['/fr'])}</head></html>`);
      if (req.url === '/de') return res.end('<html lang="de"><head></head></html>');
      res.end('<html></html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  it('fetches the alternates and finds one-way links', async () => {
    const m = await readPageMeta(`${base}/fr`, { bot: 'google' });
    const r = await readHreflang(m);
    expect(r.checkedReturns).toBe(true);
    expect(r.alternates.find((a) => a.lang === 'en')!.returns).toBe(true);
    expect(r.alternates.find((a) => a.lang === 'de')!.returns).toBe(false);
    expect(r.issues.map((i) => i.message)).toContain('de does not link back to this page: Google ignores one-way hreflang.');
  });
});

describe('site audit', () => {
  let server: Server;
  let base = '';
  const page = (title: string, body: string, desc = 'Pareil partout') => `<!doctype html><html lang="fr"><head><title>${title}</title><meta name="description" content="${desc}"><meta name="viewport" content="width=device-width"></head><body><h1>${title}</h1>${body}</body></html>`;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const html = (code: number, s: string) => {
        res.writeHead(code, { 'content-type': 'text/html' });
        res.end(s);
      };
      if (req.url === '/') return html(200, page('Accueil', '<a href="/a">A</a> <a href="/b">B</a> <a href="/a#prix">Prix</a> <a href="/a#equipe">Équipe</a> <a href="/mort">Mort</a>'));
      if (req.url === '/a') return html(200, page('Page', '<section id="prix"></section><a href="/">Accueil</a>'));
      if (req.url === '/b') return html(200, page('Page', '<a href="/mort">Mort</a>', 'Autre'));
      return html(404, page('404', ''));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  it('finds broken links, dead anchors, duplicates and pages missing from the sitemap', async () => {
    const a = await auditSite(`${base}/`, { site: { robots: null, manifest: null, favicon: null, sitemap: { url: `${base}/sitemap.xml`, status: 200, urls: [`${base}/`, `${base}/a`], error: null } } });
    expect(a.pages.map((p) => p.path).sort()).toEqual(['/', '/a', '/b', '/mort']);
    expect(a.brokenLinks.map((b) => [b.kind, b.path, b.from])).toEqual([
      ['page', '/mort', ['/', '/b']],
      ['anchor', '/a#equipe', ['/']],
    ]);
    expect(a.duplicateTitles).toEqual([{ value: 'Page', paths: ['/a', '/b'] }]);
    expect(a.duplicateDescriptions).toEqual([{ value: 'Pareil partout', paths: ['/', '/a'] }]);
    expect(a.notInSitemap).toEqual(['/b']);
  });
});

describe('budgets', () => {
  it('matches paths and keeps the worst device', () => {
    expect(pathMatches('/', '/')).toBe(true);
    expect(pathMatches('/blog/*', '/blog/hello/')).toBe(true);
    expect(pathMatches('/', '/blog')).toBe(false);
    expect(pathMatches('*', '/x')).toBe(true);
    const r = evaluateBudgets([{ id: 'b', path: '/', maxKb: 500, lcpMs: 2500, cls: null, maxRequests: null }], '/', [
      { deviceId: 'a', label: 'iPhone 16', bytes: 742 * 1024, requests: 40, lcpMs: 2100, cls: 0 },
      { deviceId: 'b', label: 'Laptop', bytes: 600 * 1024, requests: 40, lcpMs: 900, cls: 0 },
    ]);
    expect(r.map((x) => [x.metric, x.value, x.ok])).toEqual([
      ['weight', 742, false],
      ['lcp', 2100, true],
    ]);
    expect(describeFailures(r)).toEqual(['/ · Weight 742 KB > 500 KB (iPhone 16)']);
  });
});

describe('forms check', () => {
  it('reports the keyboard, labels and autofill of the fields', () => {
    const m = meta('<html></html>');
    const dev = (forms: FormsSummary) => [{ id: 'iphone', label: 'iPhone', overflowPx: 0, consoleErrors: [], heavyImages: [], forms }];
    const get = (forms: FormsSummary) => runChecks({ meta: m, image: null, site: null, rendered: dev(forms) }).find((c) => c.id === 'forms')!;
    expect(get({ fields: 0, wrongKeyboard: [], noAutocomplete: [], noLabel: [] }).status).toBe('info');
    expect(get({ fields: 3, wrongKeyboard: [], noAutocomplete: [], noLabel: [] })).toMatchObject({ status: 'ok', detail: '3 fields: right keyboard, labels and autofill.' });
    expect(get({ fields: 3, wrongKeyboard: ['« E-mail » (type=email)'], noAutocomplete: ['« Nom » (name)'], noLabel: [] })).toMatchObject({
      status: 'warning',
      detail: '3 fields: wrong keyboard: « E-mail » (type=email) · no autocomplete: « Nom » (name)',
    });
  });
});
