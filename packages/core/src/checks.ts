import type { PageMeta } from './meta.ts';
import type { ImageProbe } from './image.ts';

export type Severity = 'error' | 'warning';

export interface Issue {
  id: string;
  severity: Severity;
  /** The tag concerned, shown in monospace in the UI. */
  tag: string;
  message: string;
}

const RECOMMENDED_OG = { width: 1200, height: 630 };
/** Commonly cited WhatsApp limit for the preview image; heuristic, not an official figure. */
const WHATSAPP_IMAGE_BYTES = 300 * 1024;

export function checkShare(meta: PageMeta, image?: ImageProbe | null): Issue[] {
  const issues: Issue[] = [];
  const add = (id: string, severity: Severity, tag: string, message: string) => issues.push({ id, severity, tag, message });

  if (meta.status >= 400) add('http-status', 'error', `HTTP ${meta.status}`, 'Les robots de partage reçoivent une erreur : aucun aperçu ne sera affiché.');

  if (!meta.title) add('title-missing', 'error', '<title>', 'Pas de titre de page.');
  else if (meta.title.length > 60) add('title-long', 'warning', '<title>', `${meta.title.length} caractères : Google coupe vers 60.`);

  if (!meta.description) add('description-missing', 'warning', 'meta description', 'Pas de description.');
  else if (meta.description.length > 160) add('description-long', 'warning', 'meta description', `${meta.description.length} caractères : coupée au-delà de 160.`);

  if (!meta.og['title']) add('og-title-missing', 'warning', 'og:title', 'Absent : les apps se rabattent sur <title>.');
  if (!meta.og['description']) add('og-description-missing', 'warning', 'og:description', 'Absent : certaines apps n’affichent aucun texte.');
  if (!meta.og['site_name']) add('og-site-name-missing', 'warning', 'og:site_name', 'Absent : Slack, Discord et Facebook affichent le domaine au lieu du nom du site.');

  if (!meta.ogImageUrl) {
    add('og-image-missing', 'error', 'og:image', 'Pas d’image de partage : l’aperçu sera du texte seul.');
  } else {
    if (meta.ogImageIsRelative) add('og-image-relative', 'error', 'og:image', 'URL relative : la plupart des robots exigent une URL absolue (https://…).');
    if (image && !image.ok) add('og-image-unreachable', 'error', 'og:image', `Image inaccessible (${image.error ?? 'erreur'}).`);
    if (image?.ok && image.width && image.height) {
      if (image.width < RECOMMENDED_OG.width || image.height < RECOMMENDED_OG.height) {
        add('og-image-small', 'warning', 'og:image', `${image.width} × ${image.height} : recommandé ${RECOMMENDED_OG.width} × ${RECOMMENDED_OG.height}.`);
      }
      const ratio = image.width / image.height;
      if (Math.abs(ratio - 1.91) / 1.91 > 0.1) add('og-image-ratio', 'warning', 'og:image', `Ratio ${ratio.toFixed(2)}:1 : LinkedIn et X recadrent hors de 1,91:1.`);
    }
    if (image?.ok && image.bytes != null && image.bytes > WHATSAPP_IMAGE_BYTES) {
      add('og-image-heavy', 'warning', 'og:image', `${Math.round(image.bytes / 1024)} Ko : WhatsApp peut ignorer les images lourdes (moins de 300 Ko conseillé).`);
    }
  }

  if (!meta.twitter['card']) add('twitter-card-missing', 'warning', 'twitter:card', 'Absent : X affichera une petite carte.');
  if (!meta.viewport) add('viewport-missing', 'error', 'meta viewport', 'Absent : les mobiles affichent la version desktop rétrécie.');
  if (!meta.lang) add('lang-missing', 'warning', 'html lang', 'Langue non déclarée.');
  if (meta.icons.length === 0) add('icons-missing', 'warning', 'favicon', 'Aucune icône déclarée.');

  return issues;
}

/* ------------------------------------------------------------------ */
/* Full check list (the « 24 checks »)                                 */
/* ------------------------------------------------------------------ */

export type CheckGroup = 'seo' | 'partage' | 'mobile' | 'technique';
/** `info`: fine in this context (e.g. noindex on a preview). `skip`: not measurable here. */
export type CheckStatus = 'ok' | 'info' | 'warning' | 'error' | 'skip';

export interface CheckResult {
  id: string;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** Measures taken inside the emulated devices (rendered page, after JavaScript). */
export interface RenderedDevice {
  id: string;
  label: string;
  /** Horizontal overflow in CSS px (page wider than the screen). */
  overflowPx: number;
  consoleErrors: string[];
  heavyImages: { url: string; bytes: number }[];
}

export interface CheckInput {
  meta: PageMeta;
  image: ImageProbe | null;
  site: import('./site.ts').SiteFiles | null;
  rendered?: RenderedDevice[];
}

export const CHECK_GROUPS: { id: CheckGroup; label: string }[] = [
  { id: 'seo', label: 'SEO' },
  { id: 'partage', label: 'Partage' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'technique', label: 'Technique' },
];

const HEAVY_IMAGE = 500 * 1024;

/** Is the page served from a dev server or a preview deployment (where noindex is expected)? */
export function isNonProduction(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h.startsWith('127.') || h === '[::1]' || h.endsWith('.local') || /-git-|\.vercel\.app$/.test(h);
  } catch {
    return false;
  }
}

const kb = (b: number) => `${Math.round(b / 1024)} Ko`;

export function runChecks({ meta, image, site, rendered }: CheckInput): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, group: CheckGroup, label: string, status: CheckStatus, detail: string) => out.push({ id, group, label, status, detail });
  const nonProd = isNonProduction(meta.finalUrl);

  // SEO
  const t = meta.title ?? '';
  add('title', 'seo', 'Titre de la page', !t ? 'error' : t.length > 60 ? 'warning' : 'ok', !t ? 'Pas de <title>.' : `${t.length} caractères${t.length > 60 ? ' : Google coupe vers 60' : ''}.`);
  const d = meta.description ?? '';
  add('description', 'seo', 'Description', !d ? 'warning' : d.length > 160 ? 'warning' : 'ok', !d ? 'Pas de meta description.' : `${d.length} caractères${d.length > 160 ? ' : coupée au-delà de 160' : ''}.`);
  add('lang', 'seo', 'Langue', meta.lang ? 'ok' : 'warning', meta.lang ? `lang="${meta.lang}"` : 'Pas d’attribut lang sur <html>.');
  add('canonical', 'seo', 'URL canonique', meta.canonical ? 'ok' : 'warning', meta.canonical ?? 'Pas de <link rel="canonical">.');
  add('h1', 'seo', 'Titre principal (h1)', meta.h1Count === 1 ? 'ok' : 'warning', meta.h1Count === 1 ? 'Un seul h1.' : meta.h1Count === 0 ? 'Aucun h1 dans le HTML.' : `${meta.h1Count} h1 : un seul est recommandé.`);
  const noindex = /noindex/i.test(`${meta.robotsMeta ?? ''} ${meta.robotsHeader ?? ''}`);
  add('indexing', 'seo', 'Indexation', !noindex ? 'ok' : nonProd ? 'info' : 'error', !noindex ? 'Page indexable.' : nonProd ? 'noindex : normal hors production.' : 'noindex en production : Google n’affichera pas la page.');
  if (!site?.robots || site.robots.status === null) add('robots', 'seo', 'robots.txt', 'skip', 'Non lu.');
  else if (site.robots.status !== 200) add('robots', 'seo', 'robots.txt', 'warning', `Absent (HTTP ${site.robots.status}).`);
  else add('robots', 'seo', 'robots.txt', site.robots.disallowAll && !nonProd ? 'error' : 'ok', site.robots.disallowAll ? 'Bloque tous les robots (Disallow: /).' : 'Présent.');
  if (!site?.sitemap) add('sitemap', 'seo', 'Sitemap', 'skip', 'Non lu.');
  else add('sitemap', 'seo', 'Sitemap', site.sitemap.urls.length ? 'ok' : 'warning', site.sitemap.urls.length ? `${site.sitemap.urls.length} URL.` : `Introuvable (${site.sitemap.error ?? 'absent'}).`);

  // Partage
  add('og-title', 'partage', 'og:title', meta.og['title'] ? 'ok' : 'warning', meta.og['title'] ?? 'Absent : les apps se rabattent sur <title>.');
  add('og-description', 'partage', 'og:description', meta.og['description'] ? 'ok' : 'warning', meta.og['description'] ?? 'Absent.');
  add('og-site-name', 'partage', 'og:site_name', meta.og['site_name'] ? 'ok' : 'warning', meta.og['site_name'] ?? 'Absent : Slack, Discord et Facebook affichent le domaine au lieu du nom du site.');
  if (!meta.ogImageUrl) add('og-image', 'partage', 'Image de partage', 'error', 'Pas d’og:image.');
  else if (meta.ogImageIsRelative) add('og-image', 'partage', 'Image de partage', 'error', 'URL relative : les robots exigent une URL absolue.');
  else if (image && !image.ok) add('og-image', 'partage', 'Image de partage', 'error', `Inaccessible (${image.error ?? 'erreur'}).`);
  else add('og-image', 'partage', 'Image de partage', 'ok', 'Présente et accessible.');
  if (!image?.ok || !image.width || !image.height) add('og-image-format', 'partage', 'Format de l’image', 'skip', 'Image non lue.');
  else {
    const problems: string[] = [];
    if (image.width < 1200 || image.height < 630) problems.push(`${image.width}×${image.height} (1200×630 conseillé)`);
    if (Math.abs(image.width / image.height - 1.91) / 1.91 > 0.1) problems.push(`ratio ${(image.width / image.height).toFixed(2)}:1`);
    if ((image.bytes ?? 0) > 300 * 1024) problems.push(`${kb(image.bytes ?? 0)} (moins de 300 Ko conseillé)`);
    add('og-image-format', 'partage', 'Format de l’image', problems.length ? 'warning' : 'ok', problems.length ? problems.join(', ') : `${image.width}×${image.height}, ${kb(image.bytes ?? 0)}.`);
  }
  add('twitter-card', 'partage', 'twitter:card', meta.twitter['card'] ? 'ok' : 'warning', meta.twitter['card'] ?? 'Absent : X affichera une petite carte.');

  // Mobile
  const vp = meta.viewport ?? '';
  add('viewport', 'mobile', 'Meta viewport', !vp ? 'error' : /width=device-width/.test(vp) ? 'ok' : 'warning', vp || 'Absent : les mobiles affichent la version desktop rétrécie.');
  if (!rendered?.length) add('overflow', 'mobile', 'Débordement horizontal', 'skip', 'Mesuré dans les appareils.');
  else {
    const over = rendered.filter((r) => r.overflowPx > 1);
    add('overflow', 'mobile', 'Débordement horizontal', over.length ? 'error' : 'ok', over.length ? over.map((r) => `${r.label} : +${Math.round(r.overflowPx)} px`).join(', ') : `Aucun sur ${rendered.length} appareil${rendered.length > 1 ? 's' : ''}.`);
  }
  add('theme-color', 'mobile', 'Couleur du thème', meta.themeColor ? 'ok' : 'warning', meta.themeColor ?? 'Absente : la barre du navigateur mobile reste par défaut.');
  add('apple-touch-icon', 'mobile', 'Icône écran d’accueil', meta.appleTouchIcon ? 'ok' : 'warning', meta.appleTouchIcon ? meta.appleTouchIcon.split('/').pop()! : 'Pas d’apple-touch-icon.');
  if (!meta.manifest) add('manifest', 'mobile', 'Manifest', 'warning', 'Pas de manifest : le site ne s’installe pas comme une app.');
  else if (!site?.manifest || site.manifest.error) add('manifest', 'mobile', 'Manifest', 'error', site?.manifest?.error ?? 'Non lu.');
  else add('manifest', 'mobile', 'Manifest', site.manifest.name && site.manifest.icons ? 'ok' : 'warning', `${site.manifest.name ?? 'sans nom'}, ${site.manifest.icons} icône${site.manifest.icons > 1 ? 's' : ''}.`);

  // Technique
  add('http', 'technique', 'Statut HTTP', meta.status < 300 ? 'ok' : 'error', `HTTP ${meta.status}${meta.finalUrl !== meta.requestedUrl ? ` après redirection` : ''}.`);
  const fav = site?.favicon;
  add('favicon', 'technique', 'Favicon', !fav ? 'skip' : fav.status === 200 ? 'ok' : 'error', !fav ? 'Non lu.' : fav.status === 200 ? fav.url.split('/').pop()! : `${fav.url.split('/').pop()} introuvable (HTTP ${fav.status ?? '—'}).`);
  add('img-alt', 'technique', 'Textes alternatifs', meta.imgMissingAlt ? 'warning' : 'ok', meta.imgCount === 0 ? 'Aucune image dans le HTML.' : meta.imgMissingAlt ? `${meta.imgMissingAlt} image${meta.imgMissingAlt > 1 ? 's' : ''} sur ${meta.imgCount} sans alt.` : `${meta.imgCount} image${meta.imgCount > 1 ? 's' : ''}, toutes avec alt.`);
  if (!rendered?.length) {
    add('console', 'technique', 'Erreurs JavaScript', 'skip', 'Mesuré dans les appareils.');
    add('heavy-images', 'technique', 'Poids des images', 'skip', 'Mesuré dans les appareils.');
  } else {
    const errors = [...new Set(rendered.flatMap((r) => r.consoleErrors))];
    add('console', 'technique', 'Erreurs JavaScript', errors.length ? 'error' : 'ok', errors.length ? `${errors.length} erreur${errors.length > 1 ? 's' : ''} : ${errors[0]!.slice(0, 140)}` : 'Aucune erreur dans la console.');
    const heavy = new Map<string, number>();
    for (const r of rendered) for (const i of r.heavyImages) heavy.set(i.url, Math.max(heavy.get(i.url) ?? 0, i.bytes));
    const list = [...heavy].sort((a, b) => b[1] - a[1]);
    add('heavy-images', 'technique', 'Poids des images', list.length ? 'warning' : 'ok', list.length ? `${list.length} image${list.length > 1 ? 's' : ''} > ${kb(HEAVY_IMAGE)} : ${list[0]![0].split('/').pop()} (${kb(list[0]![1])})` : `Aucune image > ${kb(HEAVY_IMAGE)}.`);
  }
  return out;
}

export const HEAVY_IMAGE_BYTES = HEAVY_IMAGE;

/** Passed / measurable. `info` counts as passed, `skip` is left out. */
export function score(results: CheckResult[]): { passed: number; total: number } {
  const measured = results.filter((r) => r.status !== 'skip');
  return { passed: measured.filter((r) => r.status === 'ok' || r.status === 'info').length, total: measured.length };
}
