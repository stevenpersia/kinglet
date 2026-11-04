import type { PageMeta } from './meta.ts';
import type { ImageProbe } from './image.ts';
import { t } from './i18n.ts';

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

  if (meta.status >= 400) add('http-status', 'error', `HTTP ${meta.status}`, t('Share bots get an error: no preview will be shown.', 'Les robots de partage reçoivent une erreur : aucun aperçu ne sera affiché.'));

  if (!meta.title) add('title-missing', 'error', '<title>', t('No page title.', 'Pas de titre de page.'));
  else if (meta.title.length > 60) add('title-long', 'warning', '<title>', t(`${meta.title.length} characters: Google cuts around 60.`, `${meta.title.length} caractères : Google coupe vers 60.`));

  if (!meta.description) add('description-missing', 'warning', 'meta description', t('No description.', 'Pas de description.'));
  else if (meta.description.length > 160) add('description-long', 'warning', 'meta description', t(`${meta.description.length} characters: cut beyond 160.`, `${meta.description.length} caractères : coupée au-delà de 160.`));

  if (!meta.og['title']) add('og-title-missing', 'warning', 'og:title', t('Missing: apps fall back to <title>.', 'Absent : les apps se rabattent sur <title>.'));
  if (!meta.og['description']) add('og-description-missing', 'warning', 'og:description', t('Missing: some apps show no text.', 'Absent : certaines apps n’affichent aucun texte.'));
  if (!meta.og['site_name']) add('og-site-name-missing', 'warning', 'og:site_name', t('Missing: Slack, Discord and Facebook show the domain instead of the site name.', 'Absent : Slack, Discord et Facebook affichent le domaine au lieu du nom du site.'));

  if (!meta.ogImageUrl) {
    add('og-image-missing', 'error', 'og:image', t('No share image: the preview will be text only.', 'Pas d’image de partage : l’aperçu sera du texte seul.'));
  } else {
    if (meta.ogImageIsRelative) add('og-image-relative', 'error', 'og:image', t('Relative URL: most bots require an absolute URL (https://…).', 'URL relative : la plupart des robots exigent une URL absolue (https://…).'));
    if (image && !image.ok) add('og-image-unreachable', 'error', 'og:image', t(`Image unreachable (${image.error ?? 'error'}).`, `Image inaccessible (${image.error ?? 'erreur'}).`));
    if (image?.ok && image.width && image.height) {
      if (image.width < RECOMMENDED_OG.width || image.height < RECOMMENDED_OG.height) {
        add('og-image-small', 'warning', 'og:image', t(`${image.width} × ${image.height}: ${RECOMMENDED_OG.width} × ${RECOMMENDED_OG.height} recommended.`, `${image.width} × ${image.height} : recommandé ${RECOMMENDED_OG.width} × ${RECOMMENDED_OG.height}.`));
      }
      const ratio = image.width / image.height;
      if (Math.abs(ratio - 1.91) / 1.91 > 0.1) add('og-image-ratio', 'warning', 'og:image', t(`Ratio ${ratio.toFixed(2)}:1: LinkedIn and X crop anything other than 1.91:1.`, `Ratio ${ratio.toFixed(2)}:1 : LinkedIn et X recadrent hors de 1,91:1.`));
    }
    if (image?.ok && image.bytes != null && image.bytes > WHATSAPP_IMAGE_BYTES) {
      const size = Math.round(image.bytes / 1024);
      add('og-image-heavy', 'warning', 'og:image', t(`${size} KB: WhatsApp may ignore heavy images (under 300 KB recommended).`, `${size} Ko : WhatsApp peut ignorer les images lourdes (moins de 300 Ko conseillé).`));
    }
  }

  if (!meta.twitter['card']) add('twitter-card-missing', 'warning', 'twitter:card', t('Missing: X will show a small card.', 'Absent : X affichera une petite carte.'));
  if (!meta.viewport) add('viewport-missing', 'error', 'meta viewport', t('Missing: phones show the shrunk desktop version.', 'Absent : les mobiles affichent la version desktop rétrécie.'));
  if (!meta.lang) add('lang-missing', 'warning', 'html lang', t('Language not declared.', 'Langue non déclarée.'));
  if (meta.icons.length === 0) add('icons-missing', 'warning', 'favicon', t('No icon declared.', 'Aucune icône déclarée.'));

  return issues;
}

/* ------------------------------------------------------------------ */
/* Full check list (the « 30 checks »)                                 */
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
  /** Touch screen: taps matter (tap targets). */
  touch?: boolean;
  /** Buttons and links smaller than 24×24 CSS px (WCAG 2.5.8), links inside a sentence aside. */
  smallTargets?: { count: number; examples: string[] };
  /** Visible text under 12 px. */
  smallText?: { count: number; minPx: number; examples: string[] };
  /** Text whose contrast with its background is under 4.5:1 (3:1 for large text). */
  lowContrast?: { count: number; examples: string[] };
  /** viewport-fit=cover without env(safe-area-inset-*) anywhere: content goes under the notch. */
  notchUnsafe?: boolean;
  vitals?: Vitals;
}

/** Core Web Vitals measured in a device (ms, CLS unitless). */
export interface Vitals {
  lcpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
}

export interface CheckInput {
  meta: PageMeta;
  image: ImageProbe | null;
  site: import('./site.ts').SiteFiles | null;
  rendered?: RenderedDevice[];
}

/** Labels are getters: the language can change while the app runs. */
export const CHECK_GROUPS: { id: CheckGroup; label: string }[] = [
  { id: 'seo', label: 'SEO' },
  {
    id: 'partage',
    get label() {
      return t('Share', 'Partage');
    },
  },
  { id: 'mobile', label: 'Mobile' },
  {
    id: 'technique',
    get label() {
      return t('Technical', 'Technique');
    },
  },
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

const kb = (b: number) => `${Math.round(b / 1024)} ${t('KB', 'Ko')}`;

/** "1.2 s" / "1,2 s", or ms under a second. */
const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${t((ms / 1000).toFixed(1), (ms / 1000).toFixed(1).replace('.', ','))} s`);

/** "1 image" / "2 images" (English; the French strings keep their own plural). */
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function runChecks({ meta, image, site, rendered }: CheckInput): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, group: CheckGroup, label: string, status: CheckStatus, detail: string) => out.push({ id, group, label, status, detail });
  const nonProd = isNonProduction(meta.finalUrl);
  const notRead = t('Not read.', 'Non lu.');
  const inDevices = t('Measured in the devices.', 'Mesuré dans les appareils.');

  // SEO
  const title = meta.title ?? '';
  add(
    'title',
    'seo',
    t('Page title', 'Titre de la page'),
    !title ? 'error' : title.length > 60 ? 'warning' : 'ok',
    !title ? t('No <title>.', 'Pas de <title>.') : t(`${title.length} characters${title.length > 60 ? ': Google cuts around 60' : ''}.`, `${title.length} caractères${title.length > 60 ? ' : Google coupe vers 60' : ''}.`),
  );
  const d = meta.description ?? '';
  add(
    'description',
    'seo',
    t('Description', 'Description'),
    !d ? 'warning' : d.length > 160 ? 'warning' : 'ok',
    !d ? t('No meta description.', 'Pas de meta description.') : t(`${d.length} characters${d.length > 160 ? ': cut beyond 160' : ''}.`, `${d.length} caractères${d.length > 160 ? ' : coupée au-delà de 160' : ''}.`),
  );
  add('lang', 'seo', t('Language', 'Langue'), meta.lang ? 'ok' : 'warning', meta.lang ? `lang="${meta.lang}"` : t('No lang attribute on <html>.', 'Pas d’attribut lang sur <html>.'));
  add('canonical', 'seo', t('Canonical URL', 'URL canonique'), meta.canonical ? 'ok' : 'warning', meta.canonical ?? t('No <link rel="canonical">.', 'Pas de <link rel="canonical">.'));
  add(
    'h1',
    'seo',
    t('Main heading (h1)', 'Titre principal (h1)'),
    meta.h1Count === 1 ? 'ok' : 'warning',
    meta.h1Count === 1 ? t('A single h1.', 'Un seul h1.') : meta.h1Count === 0 ? t('No h1 in the HTML.', 'Aucun h1 dans le HTML.') : t(`${meta.h1Count} h1: a single one is recommended.`, `${meta.h1Count} h1 : un seul est recommandé.`),
  );
  const noindex = /noindex/i.test(`${meta.robotsMeta ?? ''} ${meta.robotsHeader ?? ''}`);
  add(
    'indexing',
    'seo',
    t('Indexing', 'Indexation'),
    !noindex ? 'ok' : nonProd ? 'info' : 'error',
    !noindex ? t('Page can be indexed.', 'Page indexable.') : nonProd ? t('noindex: expected outside production.', 'noindex : normal hors production.') : t('noindex in production: Google will not show the page.', 'noindex en production : Google n’affichera pas la page.'),
  );
  if (!site?.robots || site.robots.status === null) add('robots', 'seo', 'robots.txt', 'skip', notRead);
  else if (site.robots.status !== 200) add('robots', 'seo', 'robots.txt', 'warning', t(`Missing (HTTP ${site.robots.status}).`, `Absent (HTTP ${site.robots.status}).`));
  else add('robots', 'seo', 'robots.txt', site.robots.disallowAll && !nonProd ? 'error' : 'ok', site.robots.disallowAll ? t('Blocks all bots (Disallow: /).', 'Bloque tous les robots (Disallow: /).') : t('Present.', 'Présent.'));
  if (!site?.sitemap) add('sitemap', 'seo', 'Sitemap', 'skip', notRead);
  else
    add(
      'sitemap',
      'seo',
      'Sitemap',
      site.sitemap.urls.length ? 'ok' : 'warning',
      site.sitemap.urls.length ? `${site.sitemap.urls.length} URL.` : t(`Not found (${site.sitemap.error ?? 'missing'}).`, `Introuvable (${site.sitemap.error ?? 'absent'}).`),
    );

  // Share
  const shareImage = t('Share image', 'Image de partage');
  add('og-title', 'partage', 'og:title', meta.og['title'] ? 'ok' : 'warning', meta.og['title'] ?? t('Missing: apps fall back to <title>.', 'Absent : les apps se rabattent sur <title>.'));
  add('og-description', 'partage', 'og:description', meta.og['description'] ? 'ok' : 'warning', meta.og['description'] ?? t('Missing.', 'Absent.'));
  add(
    'og-site-name',
    'partage',
    'og:site_name',
    meta.og['site_name'] ? 'ok' : 'warning',
    meta.og['site_name'] ?? t('Missing: Slack, Discord and Facebook show the domain instead of the site name.', 'Absent : Slack, Discord et Facebook affichent le domaine au lieu du nom du site.'),
  );
  if (!meta.ogImageUrl) add('og-image', 'partage', shareImage, 'error', t('No og:image.', 'Pas d’og:image.'));
  else if (meta.ogImageIsRelative) add('og-image', 'partage', shareImage, 'error', t('Relative URL: bots require an absolute URL.', 'URL relative : les robots exigent une URL absolue.'));
  else if (image && !image.ok) add('og-image', 'partage', shareImage, 'error', t(`Unreachable (${image.error ?? 'error'}).`, `Inaccessible (${image.error ?? 'erreur'}).`));
  else add('og-image', 'partage', shareImage, 'ok', t('Present and reachable.', 'Présente et accessible.'));
  const imageFormat = t('Image format', 'Format de l’image');
  if (!image?.ok || !image.width || !image.height) add('og-image-format', 'partage', imageFormat, 'skip', t('Image not read.', 'Image non lue.'));
  else {
    const problems: string[] = [];
    if (image.width < 1200 || image.height < 630) problems.push(t(`${image.width}×${image.height} (1200×630 recommended)`, `${image.width}×${image.height} (1200×630 conseillé)`));
    if (Math.abs(image.width / image.height - 1.91) / 1.91 > 0.1) problems.push(`ratio ${(image.width / image.height).toFixed(2)}:1`);
    if ((image.bytes ?? 0) > 300 * 1024) problems.push(t(`${kb(image.bytes ?? 0)} (under 300 KB recommended)`, `${kb(image.bytes ?? 0)} (moins de 300 Ko conseillé)`));
    add('og-image-format', 'partage', imageFormat, problems.length ? 'warning' : 'ok', problems.length ? problems.join(', ') : `${image.width}×${image.height}, ${kb(image.bytes ?? 0)}.`);
  }
  add('twitter-card', 'partage', 'twitter:card', meta.twitter['card'] ? 'ok' : 'warning', meta.twitter['card'] ?? t('Missing: X will show a small card.', 'Absent : X affichera une petite carte.'));

  // Mobile
  const vp = meta.viewport ?? '';
  add('viewport', 'mobile', 'Meta viewport', !vp ? 'error' : /width=device-width/.test(vp) ? 'ok' : 'warning', vp || t('Missing: phones show the shrunk desktop version.', 'Absent : les mobiles affichent la version desktop rétrécie.'));
  const overflow = t('Horizontal overflow', 'Débordement horizontal');
  if (!rendered?.length) add('overflow', 'mobile', overflow, 'skip', inDevices);
  else {
    const over = rendered.filter((r) => r.overflowPx > 1);
    add(
      'overflow',
      'mobile',
      overflow,
      over.length ? 'error' : 'ok',
      over.length
        ? over.map((r) => `${r.label}${t(':', ' :')} +${Math.round(r.overflowPx)} px`).join(', ')
        : t(`None on ${n(rendered.length, 'device')}.`, `Aucun sur ${rendered.length} appareil${rendered.length > 1 ? 's' : ''}.`),
    );
  }
  // Mobile, measured in the rendered page (touch devices for tap targets).
  const touchDevices = rendered?.filter((r) => r.touch && r.smallTargets) ?? [];
  const targets = t('Tap targets', 'Zones tactiles');
  if (!touchDevices.length) add('tap-targets', 'mobile', targets, 'skip', inDevices);
  else {
    const worst = [...touchDevices].sort((a, b) => b.smallTargets!.count - a.smallTargets!.count)[0]!;
    const c = worst.smallTargets!.count;
    add(
      'tap-targets',
      'mobile',
      targets,
      c ? 'warning' : 'ok',
      c
        ? t(`${c} too small (under 24×24 px) on ${worst.label}: ${worst.smallTargets!.examples.join(', ')}`, `${c} trop petite${c > 1 ? 's' : ''} (moins de 24×24 px) sur ${worst.label} : ${worst.smallTargets!.examples.join(', ')}`)
        : t('Every button and link can be tapped (24×24 px or more).', 'Tous les boutons et liens se touchent bien (24×24 px ou plus).'),
    );
  }
  const textDevices = rendered?.filter((r) => r.smallText) ?? [];
  const textSize = t('Text size', 'Taille du texte');
  if (!textDevices.length) add('small-text', 'mobile', textSize, 'skip', inDevices);
  else {
    const worst = [...textDevices].sort((a, b) => b.smallText!.count - a.smallText!.count)[0]!;
    const st = worst.smallText!;
    add(
      'small-text',
      'mobile',
      textSize,
      st.count ? 'warning' : 'ok',
      st.count
        ? t(`${st.count} text${st.count > 1 ? 's' : ''} under 12 px on ${worst.label} (down to ${st.minPx} px): ${st.examples.join(', ')}`, `${st.count} texte${st.count > 1 ? 's' : ''} sous 12 px sur ${worst.label} (jusqu’à ${st.minPx} px) : ${st.examples.join(', ')}`)
        : t('No text under 12 px.', 'Aucun texte sous 12 px.'),
    );
  }
  const notch = t('Notch and rounded corners', 'Encoche et coins arrondis');
  if (!rendered?.some((r) => r.notchUnsafe !== undefined)) add('safe-area', 'mobile', notch, 'skip', inDevices);
  else
    add(
      'safe-area',
      'mobile',
      notch,
      rendered.some((r) => r.notchUnsafe) ? 'warning' : 'ok',
      rendered.some((r) => r.notchUnsafe)
        ? t('viewport-fit=cover, but no env(safe-area-inset-*) in the CSS: content can go under the notch.', 'viewport-fit=cover, mais aucun env(safe-area-inset-*) dans le CSS : le contenu peut passer sous l’encoche.')
        : t('Content stays clear of the notch.', 'Le contenu reste hors de l’encoche.'),
    );
  add('theme-color', 'mobile', t('Theme color', 'Couleur du thème'), meta.themeColor ? 'ok' : 'warning', meta.themeColor ?? t('Missing: the mobile browser bar keeps its default color.', 'Absente : la barre du navigateur mobile reste par défaut.'));
  add(
    'apple-touch-icon',
    'mobile',
    t('Home screen icon', 'Icône écran d’accueil'),
    meta.appleTouchIcon ? 'ok' : 'warning',
    meta.appleTouchIcon ? meta.appleTouchIcon.split('/').pop()! : t('No apple-touch-icon.', 'Pas d’apple-touch-icon.'),
  );
  if (!meta.manifest) add('manifest', 'mobile', 'Manifest', 'warning', t('No manifest: the site cannot be installed as an app.', 'Pas de manifest : le site ne s’installe pas comme une app.'));
  else if (!site?.manifest || site.manifest.error) add('manifest', 'mobile', 'Manifest', 'error', site?.manifest?.error ?? notRead);
  else
    add(
      'manifest',
      'mobile',
      'Manifest',
      site.manifest.name && site.manifest.icons ? 'ok' : 'warning',
      t(
        `${site.manifest.name ?? 'no name'}, ${n(site.manifest.icons, 'icon')}.`,
        `${site.manifest.name ?? 'sans nom'}, ${site.manifest.icons} icône${site.manifest.icons > 1 ? 's' : ''}.`,
      ),
    );

  // Technical
  add('http', 'technique', t('HTTP status', 'Statut HTTP'), meta.status < 300 ? 'ok' : 'error', `HTTP ${meta.status}${meta.finalUrl !== meta.requestedUrl ? t(' after redirect', ' après redirection') : ''}.`);
  const fav = site?.favicon;
  add(
    'favicon',
    'technique',
    'Favicon',
    !fav ? 'skip' : fav.status === 200 ? 'ok' : 'error',
    !fav ? notRead : fav.status === 200 ? fav.url.split('/').pop()! : t(`${fav.url.split('/').pop()} not found (HTTP ${fav.status ?? '—'}).`, `${fav.url.split('/').pop()} introuvable (HTTP ${fav.status ?? '—'}).`),
  );
  add(
    'img-alt',
    'technique',
    t('Alt text', 'Textes alternatifs'),
    meta.imgMissingAlt ? 'warning' : 'ok',
    meta.imgCount === 0
      ? t('No images in the HTML.', 'Aucune image dans le HTML.')
      : meta.imgMissingAlt
        ? t(`${meta.imgMissingAlt} of ${n(meta.imgCount, 'image')} without alt.`, `${meta.imgMissingAlt} image${meta.imgMissingAlt > 1 ? 's' : ''} sur ${meta.imgCount} sans alt.`)
        : t(`${n(meta.imgCount, 'image')}, all with alt.`, `${meta.imgCount} image${meta.imgCount > 1 ? 's' : ''}, toutes avec alt.`),
  );
  const contrastDevices = rendered?.filter((r) => r.lowContrast) ?? [];
  const contrast = t('Text contrast', 'Contraste du texte');
  if (!contrastDevices.length) add('contrast', 'technique', contrast, 'skip', inDevices);
  else {
    const worst = [...contrastDevices].sort((a, b) => b.lowContrast!.count - a.lowContrast!.count)[0]!;
    const c = worst.lowContrast!.count;
    add(
      'contrast',
      'technique',
      contrast,
      c ? 'warning' : 'ok',
      c ? t(`${c} text${c > 1 ? 's' : ''} hard to read (under 4.5:1): ${worst.lowContrast!.examples.join(', ')}`, `${c} texte${c > 1 ? 's' : ''} peu lisible${c > 1 ? 's' : ''} (moins de 4,5:1) : ${worst.lowContrast!.examples.join(', ')}`) : t('Every text is readable (4.5:1 or more).', 'Tous les textes sont lisibles (4,5:1 ou plus).'),
    );
  }
  // Core Web Vitals: the slowest device decides (phones, with the throttling chosen).
  const withVitals = rendered?.filter((r) => r.vitals) ?? [];
  const lcps = withVitals.filter((r) => r.vitals!.lcpMs != null).sort((a, b) => b.vitals!.lcpMs! - a.vitals!.lcpMs!);
  if (!lcps.length) add('lcp', 'technique', t('Largest paint (LCP)', 'Plus grand affichage (LCP)'), 'skip', inDevices);
  else {
    const w = lcps[0]!;
    const ms = w.vitals!.lcpMs!;
    add('lcp', 'technique', t('Largest paint (LCP)', 'Plus grand affichage (LCP)'), ms > 4000 ? 'error' : ms > 2500 ? 'warning' : 'ok', t(`${secs(ms)} on ${w.label} (good under 2.5 s).`, `${secs(ms)} sur ${w.label} (bon sous 2,5 s).`));
  }
  const clss = withVitals.filter((r) => r.vitals!.cls != null).sort((a, b) => b.vitals!.cls! - a.vitals!.cls!);
  if (!clss.length) add('cls', 'technique', t('Layout shifts (CLS)', 'Décalages (CLS)'), 'skip', inDevices);
  else {
    const w = clss[0]!;
    const v = w.vitals!.cls!;
    add('cls', 'technique', t('Layout shifts (CLS)', 'Décalages (CLS)'), v > 0.25 ? 'error' : v > 0.1 ? 'warning' : 'ok', t(`${v.toFixed(3)} on ${w.label} (good under 0.1).`, `${v.toFixed(3).replace('.', ',')} sur ${w.label} (bon sous 0,1).`));
  }
  const jsErrors = t('JavaScript errors', 'Erreurs JavaScript');
  const imageWeight = t('Image weight', 'Poids des images');
  if (!rendered?.length) {
    add('console', 'technique', jsErrors, 'skip', inDevices);
    add('heavy-images', 'technique', imageWeight, 'skip', inDevices);
  } else {
    const errors = [...new Set(rendered.flatMap((r) => r.consoleErrors))];
    add(
      'console',
      'technique',
      jsErrors,
      errors.length ? 'error' : 'ok',
      errors.length
        ? t(`${n(errors.length, 'error')}: ${errors[0]!.slice(0, 140)}`, `${errors.length} erreur${errors.length > 1 ? 's' : ''} : ${errors[0]!.slice(0, 140)}`)
        : t('No errors in the console.', 'Aucune erreur dans la console.'),
    );
    const heavy = new Map<string, number>();
    for (const r of rendered) for (const i of r.heavyImages) heavy.set(i.url, Math.max(heavy.get(i.url) ?? 0, i.bytes));
    const list = [...heavy].sort((a, b) => b[1] - a[1]);
    add(
      'heavy-images',
      'technique',
      imageWeight,
      list.length ? 'warning' : 'ok',
      list.length
        ? t(
            `${n(list.length, 'image')} > ${kb(HEAVY_IMAGE)}: ${list[0]![0].split('/').pop()} (${kb(list[0]![1])})`,
            `${list.length} image${list.length > 1 ? 's' : ''} > ${kb(HEAVY_IMAGE)} : ${list[0]![0].split('/').pop()} (${kb(list[0]![1])})`,
          )
        : t(`No images > ${kb(HEAVY_IMAGE)}.`, `Aucune image > ${kb(HEAVY_IMAGE)}.`),
    );
  }
  return out;
}

export const HEAVY_IMAGE_BYTES = HEAVY_IMAGE;

/** Passed / measurable. `info` counts as passed, `skip` is left out. */
export function score(results: CheckResult[]): { passed: number; total: number } {
  const measured = results.filter((r) => r.status !== 'skip');
  return { passed: measured.filter((r) => r.status === 'ok' || r.status === 'info').length, total: measured.length };
}
