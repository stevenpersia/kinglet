// Static build: copies src/ to dist/, fills in the site URL, writes robots.txt, sitemap and manifest.
// The site URL comes from --site, KINGLET_SITE_URL, or Vercel's production domain at build time.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'https://github.com/stevenpersia/kinglet';
/** Public repository holding the releases (the code stays private). */
export const RELEASES = 'https://github.com/stevenpersia/kinglet-releases';

export function siteUrl(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--site');
  const raw = (i >= 0 && argv[i + 1]) || env.KINGLET_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) || (env.VERCEL_URL && `https://${env.VERCEL_URL}`) || 'http://localhost:4173';
  return raw.replace(/\/$/, '');
}

export function build(out, site) {
  const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(src, out, { recursive: true });
  const html = readFileSync(join(src, 'index.html'), 'utf8').replaceAll('{{SITE}}', site).replaceAll('{{RELEASES}}', RELEASES).replaceAll('{{REPO}}', REPO);
  writeFileSync(join(out, 'index.html'), html);
  writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
  writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc></url>\n</urlset>\n`);
  writeFileSync(
    join(out, 'manifest.webmanifest'),
    JSON.stringify({ name: 'Kinglet', short_name: 'Kinglet', start_url: '/', display: 'standalone', background_color: '#0a0a0b', theme_color: '#0a0a0b', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2),
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '../dist');
  const site = siteUrl();
  build(out, site);
  console.log(`dist/ built for ${site}`);
}
