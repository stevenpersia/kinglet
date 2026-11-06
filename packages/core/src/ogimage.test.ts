import { describe, expect, it } from 'vitest';
import { buildOgImageHtml, buildOgImageTags, contrast, freeName, frameworkFromPackage, ogImageDefaults, ogLogoCandidate, parseColor, parseMeta, setLanguage, staticDirFor, textColorOn, titleSize, type PageMeta } from './index.ts';

const meta = (html: string, url = 'https://maisonsable.fr/atelier'): PageMeta => ({
  ...parseMeta(html, url),
  requestedUrl: url,
  finalUrl: url,
  status: 200,
  contentType: 'text/html',
  fetchedAs: 'whatsapp',
  durationMs: 1,
  robotsHeader: null,
});

describe('share image colors', () => {
  it('parses hex and rgb colors', () => {
    expect(parseColor('#2F5D50')).toEqual({ r: 47, g: 93, b: 80 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('papayawhip')).toBeNull();
    expect(parseColor('#12')).toBeNull();
  });

  it('picks the readable text color', () => {
    expect(textColorOn('#111113')).toBe('#ffffff');
    expect(textColorOn('#2F5D50')).toBe('#ffffff');
    expect(textColorOn('#F5E6C8')).toBe('#111113');
    expect(textColorOn('#ffeb3b')).toBe('#111113');
    expect(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });
});

describe('share image template', () => {
  const html = `<html><head><title>L’atelier — Maison Sable</title><meta name="description" content="Céramiques faites main à Nantes.">
    <meta name="theme-color" content="#2F5D50"><link rel="apple-touch-icon" href="/apple.png"><link rel="icon" href="/favicon.ico"></head></html>`;

  it('starts from the page: title without the site name, description, theme color, domain', () => {
    const d = ogImageDefaults(meta(html));
    expect(d.title).toBe('L’atelier');
    expect(d.siteName).toBe('Maison Sable');
    expect(d.subtitle).toBe('Céramiques faites main à Nantes.');
    expect(d.color).toBe('#2f5d50');
    expect(d.domain).toBe('maisonsable.fr');
    expect(ogImageDefaults(meta(html), { domain: 'www.example.org' }).domain).toBe('example.org');
    expect(ogLogoCandidate(meta(html))).toBe('https://maisonsable.fr/apple.png');
  });

  it('builds a self-contained 1200×630 page with the text escaped', () => {
    for (const layout of ['bold', 'card', 'centered'] as const) {
      const out = buildOgImageHtml({ layout, title: 'Tom & <Jerry>', subtitle: 'a "b"', siteName: 'S', domain: 'x.fr', color: '#2F5D50', logo: null });
      expect(out).toContain('width: 1200px; height: 630px');
      expect(out).toContain('Tom &amp; &lt;Jerry&gt;');
      expect(out).not.toContain('<Jerry>');
      expect(out).not.toMatch(/src="https?:/);
    }
    expect(titleSize('Court', 'bold')).toBeGreaterThan(titleSize('Un titre bien plus long que les autres, qui prend deux lignes au moins', 'bold'));
  });
});

describe('where the image goes', () => {
  it('reads the framework from package.json and picks the static folder', () => {
    expect(frameworkFromPackage({ dependencies: { next: '15' } })).toBe('next');
    expect(frameworkFromPackage({ devDependencies: { '@sveltejs/kit': '2', vite: '6' } })).toBe('sveltekit');
    expect(frameworkFromPackage({ devDependencies: { vite: '6' } })).toBe('vite');
    expect(frameworkFromPackage({})).toBeNull();
    expect(staticDirFor('sveltekit')).toBe('static');
    expect(staticDirFor('next')).toBe('public');
    expect(staticDirFor('html')).toBe('');
  });

  it('never takes a name already used', () => {
    expect(freeName(() => false)).toBe('og.png');
    const taken = new Set(['og.png', 'og-2.png']);
    expect(freeName((n) => taken.has(n))).toBe('og-3.png');
  });

  it('gives the tags with an absolute URL for each framework', () => {
    setLanguage('fr');
    const next = buildOgImageTags('next', 'https://maisonsable.fr', '/og.png', '/home/me/site/public/og.png');
    expect(next.code).toContain("metadataBase: new URL('https://maisonsable.fr')");
    expect(next.code).toContain("url: '/og.png', width: 1200, height: 630");
    expect(next.prompt).toContain('/home/me/site/public/og.png');
    const html = buildOgImageTags('vite', 'https://maisonsable.fr/', '/og-2.png', null);
    expect(html.code).toContain('<meta property="og:image" content="https://maisonsable.fr/og-2.png">');
    expect(html.code).toContain('summary_large_image');
    expect(buildOgImageTags('sveltekit', 'https://a.fr', '/og.png', null).code).toMatch(/^<svelte:head>/);
    setLanguage('en');
  });
});
