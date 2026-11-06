// Static build: Vite bundles the React page, then renders it to HTML (so the page reads without JavaScript),
// fills in the head with absolute URLs, and writes robots.txt, sitemap and manifest.
// The site URL comes from --site, KINGLET_SITE_URL, or Vercel's production domain at build time.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = 'https://github.com/stevenpersia/kinglet';
/** Public repository holding the releases (the code stays private). */
export const RELEASES = 'https://github.com/stevenpersia/kinglet-releases';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const TITLE = 'Kinglet — the dev environment for vibe coding';
export const DESCRIPTION =
  'Build with Claude, see it on 10 devices at once, point at what’s wrong and let Claude fix it. Ship through Vercel and GitHub with 37 checks.';

/** The static pages besides the landing page, each at /<path>/ (src/Thanks.tsx, src/Legal.tsx). */
export const STATIC_PAGES = ['thanks', 'legal', 'terms', 'privacy'];

export function siteUrl(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--site');
  const raw = (i >= 0 && argv[i + 1]) || env.KINGLET_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) || (env.VERCEL_URL && `https://${env.VERCEL_URL}`) || 'http://localhost:4173';
  return raw.replace(/\/$/, '');
}

export function head(site) {
  return [
    `<title>${TITLE}</title>`,
    `<meta name="description" content="${DESCRIPTION}">`,
    `<link rel="canonical" href="${site}/">`,
    '<meta name="theme-color" content="#08080a">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Kinglet">',
    `<meta property="og:title" content="${TITLE}">`,
    '<meta property="og:description" content="Every device, every deploy. Point at it, Claude fixes it.">',
    `<meta property="og:url" content="${site}/">`,
    `<meta property="og:image" content="${site}/og.png">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/manifest.webmanifest">',
  ].join('\n  ');
}

/** Head of a static page (thanks, legal): its own title and canonical, out of search results if `noindex`. */
export function pageHead(site, { path, title, description, noindex = false }) {
  return [
    `<title>${title} — Kinglet</title>`,
    `<meta name="description" content="${description}">`,
    ...(noindex ? ['<meta name="robots" content="noindex">'] : []),
    `<link rel="canonical" href="${site}/${path}/">`,
    '<meta name="theme-color" content="#08080a">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  ].join('\n  ');
}

export const thanksHead = (site) => pageHead(site, { path: 'thanks', title: 'Thanks', description: 'Your Kinglet license: get the key, download the app, activate it.', noindex: true });

export async function build(out, site) {
  const { build: vite } = await import('vite');
  const ssr = mkdtempSync(join(tmpdir(), 'kinglet-web-ssr-'));
  let indexed = [''];
  try {
    await vite({ root: ROOT, logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });
    await vite({ root: ROOT, logLevel: 'warn', ssr: { noExternal: true }, build: { ssr: 'src/entry-server.tsx', outDir: ssr, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'entry-server.mjs' } } } });
    const { render, renderThanks, legalPages, missingPublisherFields } = await import(pathToFileURL(join(ssr, 'entry-server.mjs')).href);
    const template = readFileSync(join(out, 'index.html'), 'utf8');
    writeFileSync(join(out, 'index.html'), template.replace('<!--head-->', head(site)).replace('<!--app-->', render()));
    // /thanks (after paying) and the legal pages: same styles, no JavaScript (the landing page's script would hydrate the wrong page).
    const bare = template.replace(/<script type="module"[^>]*><\/script>\s*/g, '').replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
    const pages = [{ path: 'thanks', head: thanksHead(site), html: renderThanks() }, ...legalPages.map((p) => ({ path: p.path, head: pageHead(site, p), html: p.html() }))];
    for (const page of pages) {
      mkdirSync(join(out, page.path), { recursive: true });
      writeFileSync(join(out, page.path, 'index.html'), bare.replace('<!--head-->', page.head).replace('<!--app-->', page.html));
    }
    indexed = ['', ...legalPages.map((p) => `${p.path}/`)];
    const missing = missingPublisherFields();
    if (missing.length) console.warn(`Legal pages: fill in ${missing.join(', ')} in apps/web/src/publisher.ts before launch.`);
  } finally {
    rmSync(ssr, { recursive: true, force: true });
  }
  writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
  writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map((p) => `  <url><loc>${site}/${p}</loc></url>\n`).join('')}</urlset>\n`);
  writeFileSync(
    join(out, 'manifest.webmanifest'),
    JSON.stringify({ name: 'Kinglet', short_name: 'Kinglet', start_url: '/', display: 'standalone', background_color: '#08080a', theme_color: '#08080a', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2),
  );
  return out;
}

/**
 * Vercel Build Output API (.vercel/output): the static site plus the launch-list function at /api/waitlist.
 * Packaging the function here (rather than an api/ folder) keeps Vercel from re-installing the whole
 * monorepo, Electron included, just to build it.
 */
export async function vercelOutput(dist, out = join(ROOT, '.vercel/output')) {
  const { build: vite } = await import('vite');
  rmSync(out, { recursive: true, force: true });
  cpSync(dist, join(out, 'static'), { recursive: true });
  const fn = join(out, 'functions/api/waitlist.func');
  await vite({
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    ssr: { noExternal: true },
    build: { ssr: 'functions/waitlist.ts', outDir: fn, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'index.js', format: 'es' } } },
  });
  writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }, null, 2));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, ...STATIC_PAGES.map((p) => ({ src: `^/${p}/?$`, dest: `/${p}/index.html` }))] }, null, 2));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = siteUrl();
  const dist = await build(join(ROOT, 'dist'), site);
  console.log(`dist/ built for ${site}`);
  if (process.env.VERCEL) {
    await vercelOutput(dist);
    console.log('.vercel/output/ written (static site + /api/waitlist)');
  }
}
