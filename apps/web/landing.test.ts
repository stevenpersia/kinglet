// Dogfooding: the landing page must pass Parakeet's own checks and share previews.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeImage, readPageMeta, readSharePreviews, readSiteFiles, runChecks } from '@parakeet/core';
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
  dir = mkdtempSync(join(tmpdir(), 'parakeet-web-'));
  build(dir, site);
  server = await serve(dir, PORT);
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

it('takes the site URL from Vercel at build time', () => {
  expect(siteUrl([], { VERCEL_PROJECT_PRODUCTION_URL: 'parakeet.dev' })).toBe('https://parakeet.dev');
  expect(siteUrl(['node', 'build', '--site', 'https://x.dev/'], {})).toBe('https://x.dev');
});

it('passes every check that can be measured without a browser', async () => {
  const meta = await readPageMeta(`${site}/`);
  const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl) : null;
  const siteFiles = await readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null });
  const results = runChecks({ meta, image, site: siteFiles });
  const failing = results.filter((r) => r.status === 'warning' || r.status === 'error').map((r) => `${r.id}: ${r.detail}`);
  expect(failing).toEqual([]);
  expect(results.filter((r) => r.status === 'skip').map((r) => r.id).sort()).toEqual(['console', 'heavy-images', 'overflow']);
});

it('looks right when shared, on all 7 platforms', async () => {
  const previews = await readSharePreviews(`${site}/`);
  expect(previews.cards.map((c) => `${c.platform}:${c.status}${c.problems.length ? ` (${c.problems.join('; ')})` : ''}`)).toEqual(previews.cards.map((c) => `${c.platform}:ok`));
});
