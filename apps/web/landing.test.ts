// Dogfooding: the landing page must pass Kinglet's own checks and share previews.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeImage, readPageMeta, readSharePreviews, readSiteFiles, runChecks } from '@kinglet/core';
import { afterAll, beforeAll, expect, it } from 'vitest';
// @ts-expect-error plain JS build scripts
import { build, siteUrl } from './scripts/build.mjs';
// @ts-expect-error plain JS build scripts
import { serve } from './scripts/serve.mjs';

let server: Server;
let dir = '';
const PORT = 4174;
const site = `http://localhost:${PORT}`;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kinglet-web-'));
  await build(dir, site);
  server = await serve(dir, PORT);
}, 120_000);
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

it('takes the site URL from Vercel at build time', () => {
  expect(siteUrl([], { VERCEL_PROJECT_PRODUCTION_URL: 'getkinglet.com' })).toBe('https://getkinglet.com');
  expect(siteUrl(['node', 'build', '--site', 'https://x.dev/'], {})).toBe('https://x.dev');
});

it('passes every check that can be measured without a browser', async () => {
  const meta = await readPageMeta(`${site}/`);
  const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl) : null;
  const siteFiles = await readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null });
  const results = runChecks({ meta, image, site: siteFiles });
  const failing = results.filter((r) => r.status === 'warning' || r.status === 'error').map((r) => `${r.id}: ${r.detail}`);
  expect(failing).toEqual([]);
  expect(results.filter((r) => r.status === 'skip').map((r) => r.id).sort()).toEqual(['a11y-minor', 'a11y-serious', 'cls', 'console', 'contrast', 'focus-visible', 'forms', 'heavy-images', 'lcp', 'overflow', 'safe-area', 'small-text', 'tap-targets', 'text-zoom']);
});

it('looks right when shared, on all 10 platforms', async () => {
  const previews = await readSharePreviews(`${site}/`);
  expect(previews.cards.map((c) => `${c.platform}:${c.status}${c.problems.length ? ` (${c.problems.join('; ')})` : ''}`)).toEqual(previews.cards.map((c) => `${c.platform}:ok`));
});

it('has a thanks page for after paying, out of search results and without JavaScript', async () => {
  const res = await fetch(`${site}/thanks/`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('Thanks, Kinglet is yours.');
  expect(html).toContain('noindex');
  expect(html).toContain('https://polar.sh/kinglet/portal');
  expect(html).toContain('/releases/latest');
  expect(html).not.toMatch(/<script/);
  expect(html).toMatch(/<link rel="stylesheet"/);
});

it('has the legal pages, linked from every page, without JavaScript', async () => {
  for (const [path, title] of [['legal', 'Legal notice'], ['terms', 'Terms of sale and license'], ['privacy', 'Privacy policy']]) {
    const res = await fetch(`${site}/${path}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<title>${title} — Kinglet</title>`);
    expect(html).toContain(`<link rel="canonical" href="${site}/${path}/">`);
    expect(html).not.toMatch(/<script/);
  }
  const terms = (await (await fetch(`${site}/terms/`)).text()).replaceAll('<!-- -->', '');
  expect(terms).toContain('$49, paid once');
  expect(terms).toContain('up to 3 computers');
  expect(terms).toContain('14 days');
  for (const page of ['/', '/thanks/', '/privacy/']) {
    const html = await (await fetch(`${site}${page}`)).text();
    for (const link of ['/terms/', '/privacy/', '/legal/']) expect(html, `${page} links to ${link}`).toContain(`href="${link}"`);
  }
  const sitemap = await (await fetch(`${site}/sitemap.xml`)).text();
  expect(sitemap).toContain(`${site}/terms/`);
  expect(sitemap).not.toContain('/thanks');
});

it('names the publisher and the consumer mediator, with nothing left to fill in', async () => {
  const legal = (await (await fetch(`${site}/legal/`)).text()).replaceAll('<!-- -->', '');
  expect(legal).not.toContain('to fill in');
  expect(legal).toContain('532 606 746');
  expect(legal).toContain('contact@getkinglet.com');
  const terms = (await (await fetch(`${site}/terms/`)).text()).replaceAll('<!-- -->', '');
  expect(terms).not.toContain('to fill in');
  expect(terms).toContain('La Médiation Professionnelle');
});
