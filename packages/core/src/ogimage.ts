import type { Framework, PageMeta } from './meta.ts';
import { guessSiteName } from './fix.ts';
import { t } from './i18n.ts';

/** Size of the generated share image: what every platform shows without cropping (1.91:1). */
export const OG_SIZE = { width: 1200, height: 630 } as const;
/** WhatsApp may ignore heavier images (the limit the checks use). */
export const OG_MAX_BYTES = 300 * 1024;

export type OgLayout = 'bold' | 'card' | 'centered';
export const OG_LAYOUTS: OgLayout[] = ['bold', 'card', 'centered'];

export interface OgImageInput {
  layout: OgLayout;
  title: string;
  subtitle: string;
  siteName: string;
  /** Shown small, e.g. "maisonsable.fr". */
  domain: string;
  /** Background (bold, centered) or accent (card), as #rrggbb. */
  color: string;
  /** Logo as a data URL (or any URL the renderer can load), or null. */
  logo: string | null;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** #rgb, #rrggbb, #rrggbbaa, rgb() / rgba(): the color, else null. */
export function parseColor(css: string | null | undefined): Rgb | null {
  if (!css) return null;
  const s = css.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (p.length === 3 && p.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return { r: p[0]!, g: p[1]!, b: p[2]! };
  }
  return null;
}

export const toHex = ({ r, g, b }: Rgb) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

/** WCAG contrast ratio between two colors. */
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const INK: Rgb = { r: 17, g: 17, b: 19 };

/** The text color that reads best on `bg`: white or near black. */
export function textColorOn(bg: string): string {
  const c = parseColor(bg) ?? INK;
  return contrast(c, WHITE) >= contrast(c, INK) ? '#ffffff' : '#111113';
}

const DEFAULT_COLOR = '#111113';

/** Strip " — Site" (or "Site | ") from a title when that part is the site name. */
function cleanTitle(title: string, siteName: string): string {
  const parts = title.split(/\s+[—–|·-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return title.trim();
  const rest = parts.filter((p) => p.toLowerCase() !== siteName.toLowerCase());
  return (rest.length ? rest : parts).join(' — ');
}

const cut = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…');

/**
 * The editor's starting point, from the page itself: its title and description, its site name,
 * its theme-color and its icon. `domain`: the production domain when known.
 */
export function ogImageDefaults(meta: PageMeta, opts: { domain?: string | null; logo?: string | null } = {}): OgImageInput {
  const siteName = guessSiteName(meta);
  const rawTitle = meta.og['title'] ?? meta.title ?? siteName;
  let domain = opts.domain ?? null;
  if (!domain) {
    try {
      domain = new URL(meta.canonical ?? meta.finalUrl).host;
    } catch {
      domain = '';
    }
  }
  const color = parseColor(meta.themeColor);
  return {
    layout: 'bold',
    title: cut(cleanTitle(rawTitle, siteName), 90),
    subtitle: cut(meta.og['description'] ?? meta.description ?? '', 140),
    siteName,
    domain: domain.replace(/^www\./, ''),
    color: color ? toHex(color) : DEFAULT_COLOR,
    logo: opts.logo ?? null,
  };
}

/** The icon worth showing big: apple-touch-icon (180 px) first, then an image favicon. */
export function ogLogoCandidate(meta: PageMeta): string | null {
  if (meta.appleTouchIcon) return meta.appleTouchIcon;
  return meta.icons.find((i) => /\.(png|svg|webp|jpe?g)(\?|$)/i.test(i)) ?? meta.icons[0] ?? null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bigger for short titles, so the image reads at thumbnail size. */
export function titleSize(title: string, layout: OgLayout): number {
  const n = title.length;
  const base = n <= 28 ? 84 : n <= 50 ? 70 : n <= 75 ? 58 : 50;
  return layout === 'centered' ? Math.round(base * 0.92) : base;
}

/** Mix a color toward white (k > 0) or black (k < 0). */
function shade(hex: string, k: number): string {
  const c = parseColor(hex) ?? INK;
  const to = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  return toHex({ r: c.r + (to - c.r) * a, g: c.g + (to - c.g) * a, b: c.b + (to - c.b) * a });
}

/** A self-contained 1200×630 HTML page (no network) rendering the share image. */
export function buildOgImageHtml(input: OgImageInput): string {
  const { width, height } = OG_SIZE;
  const color = toHex(parseColor(input.color) ?? INK);
  const onColor = textColorOn(color);
  const light = onColor !== '#ffffff';
  const size = titleSize(input.title, input.layout);
  const logo = input.logo ? `<img class="logo" src="${esc(input.logo)}" alt="">` : '';
  const brand = `<div class="brand">${logo}<span>${esc(input.siteName)}</span></div>`;
  const subtitle = input.subtitle ? `<p class="sub">${esc(input.subtitle)}</p>` : '';
  const domain = input.domain ? `<span class="domain">${esc(input.domain)}</span>` : '';
  const font = `"Inter", "Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

  let css: string;
  let body: string;
  switch (input.layout) {
    case 'card': {
      // Neutral page, the color as an accent bar and on the brand.
      const ink = '#111113';
      css = `
        body { background: #fafaf9; color: ${ink}; }
        .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 24px; background: ${color}; }
        .wrap { position: absolute; inset: 72px 88px 64px 112px; display: flex; flex-direction: column; }
        .brand { color: ${contrast(parseColor(color)!, { r: 250, g: 250, b: 249 }) >= 3 ? color : ink}; }
        h1 { margin: auto 0 0; }
        .sub { color: #52525b; }
        .foot { margin-top: 44px; display: flex; justify-content: space-between; align-items: center; color: #71717a; }
        .logo { background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }`;
      body = `<div class="bar"></div><div class="wrap">${brand}<h1>${esc(input.title)}</h1>${subtitle}<div class="foot">${domain}</div></div>`;
      break;
    }
    case 'centered':
      css = `
        body { background: radial-gradient(120% 90% at 50% 0%, ${shade(color, light ? -0.06 : 0.12)} 0%, ${color} 60%); color: ${onColor}; }
        .wrap { position: absolute; inset: 64px 110px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .brand { flex-direction: column; gap: 18px; margin-bottom: 32px; }
        .logo { width: 96px; height: 96px; border-radius: 22px; }
        .sub { opacity: .78; max-width: 900px; }
        .domain { margin-top: 36px; opacity: .6; }`;
      body = `<div class="wrap">${brand}<h1>${esc(input.title)}</h1>${subtitle}${domain}</div>`;
      break;
    default:
      css = `
        body { background: linear-gradient(135deg, ${shade(color, light ? -0.04 : 0.1)} 0%, ${color} 55%, ${shade(color, light ? -0.1 : -0.25)} 100%); color: ${onColor}; }
        .wrap { position: absolute; inset: 72px 88px 64px; display: flex; flex-direction: column; }
        h1 { margin: auto 0 0; }
        .sub { opacity: .78; }
        .foot { margin-top: 44px; display: flex; justify-content: flex-end; opacity: .65; }`;
      body = `<div class="wrap">${brand}<h1>${esc(input.title)}</h1>${subtitle}<div class="foot">${domain}</div></div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { position: relative; font-family: ${font}; -webkit-font-smoothing: antialiased; }
    .brand { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
    .logo { width: 56px; height: 56px; border-radius: 14px; object-fit: contain; }
    h1 { font-size: ${size}px; line-height: 1.08; font-weight: 700; letter-spacing: -0.025em; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-wrap: balance; }
    .sub { font-size: 30px; line-height: 1.35; margin: 24px 0 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .domain { font-size: 24px; font-weight: 500; letter-spacing: 0.01em; }
    ${css}
  </style></head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ */
/* Where the file goes, and the tags that point to it                  */
/* ------------------------------------------------------------------ */

/** Framework from the project's package.json dependencies (more reliable than the HTML when known). */
export function frameworkFromPackage(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null): Framework | null {
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['next']) return 'next';
  if (deps['nuxt']) return 'nuxt';
  if (deps['astro']) return 'astro';
  if (deps['@sveltejs/kit']) return 'sveltekit';
  if (deps['@remix-run/react'] || deps['@react-router/dev'] || (deps['react-router'] && deps['@react-router/node'])) return 'remix';
  if (deps['vite']) return 'vite';
  return null;
}

/** Folder served at the site root, relative to the project folder ('' : the folder itself). */
export function staticDirFor(framework: Framework): string {
  switch (framework) {
    case 'sveltekit':
      return 'static';
    case 'html':
      return '';
    default:
      return 'public';
  }
}

/** og.png, og-2.png… : the first name not taken. */
export function freeName(taken: (name: string) => boolean, base = 'og', ext = 'png'): string {
  if (!taken(`${base}.${ext}`)) return `${base}.${ext}`;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}.${ext}`)) return `${base}-${i}.${ext}`;
}

export interface OgImageTags {
  /** Where the tags go. */
  file: string;
  language: 'tsx' | 'vue' | 'astro' | 'svelte' | 'html';
  code: string;
  /** Ready to send to Claude. */
  prompt: string;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * The tags pointing to the generated image, for the framework. `origin`: production origin when known
 * (else the page's); `path`: the image's path on the site ("/og.png"); `savedTo`: where the file was written.
 */
export function buildOgImageTags(framework: Framework, origin: string, path: string, savedTo: string | null, page = '/'): OgImageTags {
  const abs = `${origin.replace(/\/$/, '')}${path}`;
  let file: string;
  let language: OgImageTags['language'];
  let code: string;
  const html = (indent: string) =>
    [
      `<meta property="og:image" content="${attr(abs)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${attr(abs)}">`,
    ].map((l) => indent + l);
  switch (framework) {
    case 'next':
      file = 'app/layout.tsx';
      language = 'tsx';
      code = [
        `export const metadata: Metadata = {`,
        `  metadataBase: new URL(${q(origin)}),`,
        `  openGraph: {`,
        `    images: [{ url: ${q(path)}, width: 1200, height: 630 }],`,
        `  },`,
        `  twitter: { card: 'summary_large_image', images: [${q(path)}] },`,
        `};`,
      ].join('\n');
      break;
    case 'nuxt':
      file = 'app.vue';
      language = 'vue';
      code = [`useSeoMeta({`, `  ogImage: ${q(abs)},`, `  ogImageWidth: 1200,`, `  ogImageHeight: 630,`, `  twitterCard: 'summary_large_image',`, `  twitterImage: ${q(abs)},`, `});`].join('\n');
      break;
    case 'sveltekit':
      file = 'src/routes/+layout.svelte';
      language = 'svelte';
      code = ['<svelte:head>', ...html('  '), '</svelte:head>'].join('\n');
      break;
    case 'astro':
      file = t('src/layouts/Layout.astro, in <head>', 'src/layouts/Layout.astro, dans <head>');
      language = 'astro';
      code = html('').join('\n');
      break;
    default:
      file = framework === 'vite' || framework === 'html' ? t('index.html, in <head>', 'index.html, dans <head>') : t('the page’s <head>', 'le <head> de la page');
      language = 'html';
      code = html('').join('\n');
  }
  const where = savedTo ? t(`I saved the share image to ${savedTo} (1200×630).`, `J’ai enregistré l’image de partage dans ${savedTo} (1200×630).`) : t('I made a 1200×630 share image.', 'J’ai fait une image de partage 1200×630.');
  const prompt = [
    t(`${where} Use it as the share image of my site (page ${page} and the pages without their own image).`, `${where} Utilise-la comme image de partage de mon site (page ${page} et les pages qui n’ont pas leur propre image).`),
    ``,
    t(`Reference code for ${file}:`, `Code de référence pour ${file} :`),
    '```' + language,
    code,
    '```',
    ``,
    t(`Constraints:`, `Contraintes :`),
    t(`- the image URL must be absolute (${abs});`, `- l’URL de l’image doit être absolue (${abs}) ;`),
    t(`- replace an existing og:image or twitter:image rather than adding a second one;`, `- remplace une og:image ou twitter:image existante plutôt que d’en ajouter une deuxième ;`),
    t(`- do not change the design or the visible content;`, `- ne change ni le design ni le contenu visible ;`),
    t(`- tell me which files you changed.`, `- dis-moi quels fichiers tu as modifiés.`),
  ].join('\n');
  return { file, language, code, prompt };
}
