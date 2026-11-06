import { describe, expect, it } from 'vitest';
import { assessPrivacy, parseMeta, privacyFromHtml, runChecks, scanContent, setLanguage, type PerfDetails, type RenderedDevice } from './index.ts';

const page = (body: string, head = '') => {
  const html = `<!doctype html><html lang="fr"><head><title>Atelier</title>${head}</head><body>${body}</body></html>`;
  return { ...parseMeta(html, 'https://atelier.fr/'), requestedUrl: 'https://atelier.fr/', finalUrl: 'https://atelier.fr/', status: 200, contentType: 'text/html', fetchedAs: 'google' as const, durationMs: 0, robotsHeader: null };
};

const statuses = (meta: ReturnType<typeof page>, extra: Partial<Parameters<typeof runChecks>[0]> = {}) =>
  Object.fromEntries(runChecks({ meta, image: null, site: null, now: new Date('2026-11-06'), ...extra }).map((r) => [r.id, r.status]));

describe('content checks', () => {
  it('reads text, links and images from the raw HTML, scripts and styles aside', () => {
    const m = page('<style>.a{}</style><script>var lorem = "ipsum"</script><p>Bonjour <b>à tous</b></p><a href="/a">A</a><img src="/i.png"><picture><source srcset="/s.webp 1x, /s2.webp 2x"></picture>');
    expect(m.content.text).toBe('Bonjour à tous A');
    expect(m.content.anchors).toEqual([{ href: '/a', url: 'https://atelier.fr/a', text: 'A' }]);
    expect(m.content.images).toEqual(['https://atelier.fr/i.png', 'https://atelier.fr/s.webp']);
  });

  it('finds what a site built in a hurry leaves behind', () => {
    const scan = scanContent({
      text: 'Bienvenue chez Your Company. Lorem ipsum dolor sit amet. Écrivez à contact@example.com ou appelez le 01 23 45 67 89. TODO: photo. © 2024 Atelier',
      anchors: [
        { href: '#', url: null, text: 'En savoir plus' },
        { href: 'https://twitter.com', url: 'https://twitter.com/', text: 'Twitter' },
        { href: 'https://instagram.com/atelier.sable', url: 'https://instagram.com/atelier.sable', text: 'Instagram' },
        { href: 'tel:+15555551234', url: null, text: 'Appeler' },
        { href: '/mentions-legales', url: 'https://atelier.fr/mentions-legales', text: 'Mentions légales' },
      ],
      images: ['https://placehold.co/600x400', 'https://atelier.fr/vrai.jpg'],
    });
    expect(scan.lorem).toBe(true);
    expect(scan.filler.map((f) => f.why)).toEqual(['Lorem ipsum', 'placeholder company name', 'note left in the text']);
    expect(scan.contacts.map((c) => c.sample)).toEqual(['contact@example.com', '+15555551234', '01 23 45 67 89']);
    expect(scan.links.map((l) => l.why)).toEqual(['link that goes nowhere', 'social network home page, not an account']);
    expect(scan.images.map((i) => i.sample)).toEqual(['https://placehold.co/600x400']);
    expect(scan.copyrightYear).toBe(2024);
    expect(scan.legal).toEqual({ notice: true, privacy: false, terms: false });
  });

  it('leaves a finished page alone', () => {
    const scan = scanContent({
      text: 'Atelier Sable, céramiques faites à Lyon. Écrivez à bonjour@atelier-sable.fr. © 2021–2026 Atelier Sable',
      anchors: [
        { href: '/confidentialite', url: 'https://atelier.fr/confidentialite', text: 'Confidentialité' },
        { href: '/mentions', url: 'https://atelier.fr/mentions', text: 'Mentions légales' },
        { href: '#contact', url: null, text: 'Contact' },
      ],
      images: ['https://images.atelier.fr/bol.jpg'],
    });
    expect(scan).toMatchObject({ filler: [], lorem: false, contacts: [], links: [], images: [], copyrightYear: 2026, legal: { notice: true, privacy: true } });
  });

  it('turns the scan into checks of the Content family', () => {
    const s = statuses(page('<p>Lorem ipsum dolor sit amet</p><a href="#">Voir</a><footer>© 2023</footer>'));
    expect(s).toMatchObject({ 'filler-text': 'error', 'placeholder-links': 'warning', 'copyright-year': 'warning', 'legal-pages': 'warning', 'fake-contacts': 'ok', 'demo-images': 'ok' });
    setLanguage('fr');
    try {
      const c = runChecks({ meta: page('<footer>© 2023</footer><a href="/mentions-legales">Mentions légales</a>'), image: null, site: null, now: new Date('2026-11-06') });
      expect(c.find((x) => x.id === 'copyright-year')!.detail).toBe('© 2023, on est en 2026 : écris l’année dans le code (new Date().getFullYear()).');
      expect(c.find((x) => x.id === 'legal-pages')!.detail).toBe('Aucun lien vers la politique de confidentialité (obligatoires en France pour un site professionnel ou qui collecte des données).');
    } finally {
      setLanguage('en');
    }
  });

  it('prefers the rendered page (single-page apps) to the raw HTML', () => {
    const meta = page('<div id="root"></div>');
    const rendered: RenderedDevice[] = [{ id: 'iphone', label: 'iPhone', overflowPx: 0, consoleErrors: [], heavyImages: [], content: { text: 'Lorem ipsum dolor sit amet', anchors: [], images: [] } }];
    expect(statuses(meta)['filler-text']).toBe('ok');
    expect(statuses(meta, { rendered })['filler-text']).toBe('error');
  });
});

describe('privacy', () => {
  it('names the trackers, cookies and embeds of a fresh visit', () => {
    const r = assessPrivacy({
      source: 'browser',
      pageUrl: 'https://www.atelier.fr/',
      requests: [
        { url: 'https://www.googletagmanager.com/gtag/js?id=G-1' },
        { url: 'https://www.google-analytics.com/g/collect?v=2' },
        { url: 'https://connect.facebook.net/en_US/fbevents.js' },
        { url: 'https://connect.facebook.net/en_US/sdk.js' },
        { url: 'https://fonts.googleapis.com/css2?family=Inter' },
        { url: 'https://www.youtube.com/embed/abc' },
        { url: 'https://plausible.io/js/script.js' },
        { url: 'https://www.atelier.fr/app.js' },
      ],
      cookies: [
        { name: '_ga', domain: '.atelier.fr' },
        { name: '_fbp', domain: '.atelier.fr' },
        { name: 'session', domain: 'www.atelier.fr' },
        { name: 'YSC', domain: '.youtube.com' },
      ],
      banner: { cmp: null, visible: false, reject: false },
    });
    expect(r.trackers.map((t) => t.name)).toEqual(['Google Tag Manager', 'Google Analytics', 'Meta Pixel']);
    expect(r.exempt.map((t) => t.name)).toEqual(['Plausible']);
    expect(r.trackingCookies).toEqual([
      { name: '_ga', domain: '.atelier.fr', vendor: 'Google Analytics' },
      { name: '_fbp', domain: '.atelier.fr', vendor: 'Meta Pixel' },
    ]);
    expect(r.thirdPartyCookies).toEqual([{ name: 'YSC', domain: 'youtube.com' }]);
    expect(r.embeds.map((e) => e.name)).toEqual(['Facebook embed', 'Google Fonts', 'YouTube']);
    expect(r.cmp).toBeNull();

    const meta = page('<p>Atelier</p>');
    expect(statuses(meta, { privacy: r })).toMatchObject({ trackers: 'error', 'tracking-cookies': 'error', 'consent-banner': 'error', 'third-party-content': 'warning' });
  });

  it('accepts a consent tool, and asks for a reject button', () => {
    const base = { source: 'browser' as const, pageUrl: 'https://atelier.fr/', requests: [{ url: 'https://sdk.privacy-center.org/loader.js' }], cookies: [] };
    const meta = page('<p>Atelier</p>');
    expect(statuses(meta, { privacy: assessPrivacy({ ...base, banner: { cmp: null, visible: true, reject: true } }) })['consent-banner']).toBe('ok');
    expect(assessPrivacy({ ...base, banner: null }).cmp).toBe('Didomi');
    expect(statuses(meta, { privacy: assessPrivacy({ ...base, banner: { cmp: 'Didomi', visible: true, reject: false } }) })['consent-banner']).toBe('warning');
    expect(statuses(meta, { privacy: assessPrivacy({ ...base, requests: [], banner: { cmp: null, visible: false, reject: false } }) })).toMatchObject({ trackers: 'ok', 'tracking-cookies': 'ok', 'consent-banner': 'info', 'third-party-content': 'ok' });
  });

  it('falls back on the scripts of the HTML, without cookies', () => {
    const meta = page('<p>Atelier</p>', '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">');
    expect(meta.resources).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-1', 'https://fonts.googleapis.com/css2?family=Inter']);
    expect(assessPrivacy(privacyFromHtml(meta.finalUrl, meta.resources)).trackers.map((t) => t.name)).toEqual(['Google Tag Manager']);
    expect(statuses(meta)).toMatchObject({ trackers: 'warning', 'tracking-cookies': 'skip', 'consent-banner': 'warning', 'third-party-content': 'warning' });
  });
});

describe('performance checks', () => {
  const perf = (p: Partial<PerfDetails>): PerfDetails => ({ inpMs: null, interactions: 0, blockingMs: 0, longFrames: 0, renderBlocking: [], jsBytes: 0, jsFiles: [], cssBytes: 0, unusedCssBytes: null, cssRules: 0, cssUnreadable: 0, fontBytes: 0, fontFiles: 0, fontsNoDisplay: [], ...p });
  const device = (id: string, p: Partial<PerfDetails>): RenderedDevice => ({ id, label: id, overflowPx: 0, consoleErrors: [], heavyImages: [], performance: perf(p) });

  it('judges the slowest device', () => {
    const rendered = [
      device('Desktop', { inpMs: 80, interactions: 2, blockingMs: 0, jsBytes: 200 * 1024 }),
      device('Pixel', {
        inpMs: 340,
        interactions: 3,
        blockingMs: 720,
        longFrames: 4,
        renderBlocking: [{ url: 'https://atelier.fr/vendor.js?v=2', kind: 'js', ms: 420 }, { url: 'https://atelier.fr/app.css', kind: 'css', ms: 120 }],
        jsBytes: 640 * 1024,
        jsFiles: [{ url: 'https://atelier.fr/vendor.js?v=2', bytes: 500 * 1024 }],
        cssBytes: 200 * 1024,
        unusedCssBytes: 170 * 1024,
        cssRules: 1200,
        fontBytes: 420 * 1024,
        fontFiles: 8,
        fontsNoDisplay: ['Inter'],
      }),
    ];
    const results = runChecks({ meta: page('<p>x</p>'), image: null, site: null, rendered });
    const by = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(by['inp']).toMatchObject({ status: 'warning', detail: '340 ms on Pixel, 3 interactions (good under 200 ms).' });
    expect(by['main-thread']!.status).toBe('error');
    expect(by['render-blocking']).toMatchObject({ status: 'warning', detail: '1 script without defer or async hold the first paint: vendor.js (420 ms).' });
    expect(by['js-weight']).toMatchObject({ status: 'warning', detail: '640 KB transferred, the heaviest: vendor.js (500 KB) (good under 350 KB).' });
    expect(by['unused-css']).toMatchObject({ status: 'warning', detail: '85% of the CSS matches nothing on this page (170 KB of 200 KB).' });
    expect(by['fonts']!.status).toBe('warning');
    expect(by['fonts']!.detail).toContain('no font-display on Inter');
  });

  it('waits for an interaction before judging INP', () => {
    const results = runChecks({ meta: page('<p>x</p>'), image: null, site: null, rendered: [device('Pixel', {})] });
    expect(results.find((r) => r.id === 'inp')).toMatchObject({ status: 'skip', detail: 'Click, tap or type in a device to measure.' });
    expect(results.find((r) => r.id === 'fonts')).toMatchObject({ status: 'ok', detail: 'System fonts only.' });
  });
});

describe('performance on a dev server', () => {
  it('does not judge the weight of unminified code', () => {
    const meta = { ...parseMeta('<p>x</p>', 'http://localhost:3000/'), requestedUrl: 'http://localhost:3000/', finalUrl: 'http://localhost:3000/', status: 200, contentType: 'text/html', fetchedAs: 'google' as const, durationMs: 0, robotsHeader: null };
    const rendered: RenderedDevice[] = [{ id: 'p', label: 'Pixel', overflowPx: 0, consoleErrors: [], heavyImages: [], performance: { inpMs: null, interactions: 0, blockingMs: 0, longFrames: 0, renderBlocking: [], jsBytes: 2_000_000, jsFiles: [], cssBytes: 0, unusedCssBytes: null, cssRules: 0, cssUnreadable: 0, fontBytes: 0, fontFiles: 0, fontsNoDisplay: [] } }];
    expect(runChecks({ meta, image: null, site: null, rendered }).find((r) => r.id === 'js-weight')).toMatchObject({ status: 'info', detail: '1953 KB transferred: dev server, code not minified. Judge it on a preview.' });
  });
});
