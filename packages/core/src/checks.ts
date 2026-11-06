import type { PageMeta } from './meta.ts';
import type { ImageProbe } from './image.ts';
import { t } from './i18n.ts';
import { readStructuredData } from './structured.ts';
import { checkHreflangTags, type HreflangReport } from './hreflang.ts';
import { scanContent, type PageContent } from './content.ts';
import { assessPrivacy, privacyFromHtml, type PrivacyReport } from './privacy.ts';

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

export type CheckGroup = 'seo' | 'partage' | 'contenu' | 'mobile' | 'accessibilite' | 'vie-privee' | 'technique';
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
  /** axe-core result (run on one device per kind). */
  axe?: AxeSummary;
  /** Focusable elements that show no visible change when focused (keyboard users lose track). */
  focusMissing?: { count: number; total: number; examples: string[] };
  /** Text cut by its box (overflow hidden, ellipsis, line clamp). */
  clippedText?: { count: number; examples: string[] };
  /** Text size chosen in Kinglet (1: default) and the root font size the page ended up with. */
  textScale?: number;
  rootFontPx?: number;
  /** Form fields of the rendered page: the keyboard they bring up, autofill, labels. */
  forms?: FormsSummary;
  /** Text, links and images of the rendered page (after JavaScript), for the content checks. */
  content?: PageContent;
  /** What slows the page down: responsiveness, main thread, blocking resources, JavaScript, CSS, fonts. */
  performance?: PerfDetails;
}

/** Performance details measured in a device. Bytes are transferred (compressed) bytes. */
export interface PerfDetails {
  /** Interaction to Next Paint: the slowest interaction so far (null: no click, tap or key yet). */
  inpMs: number | null;
  interactions: number;
  /** Main thread blocked (long animation frames, beyond 50 ms each). */
  blockingMs: number | null;
  longFrames: number;
  /** Stylesheets and scripts that hold the first paint. */
  renderBlocking: { url: string; kind: 'css' | 'js'; ms: number }[];
  jsBytes: number;
  /** The heaviest scripts. */
  jsFiles: { url: string; bytes: number }[];
  cssBytes: number;
  /** Bytes of CSS rules whose selector matches nothing on the page (readable stylesheets only). */
  unusedCssBytes: number | null;
  /** Rules read to measure it (and stylesheets from other domains that cannot be read). */
  cssRules: number;
  cssUnreadable: number;
  fontBytes: number;
  fontFiles: number;
  /** @font-face rules without font-display (text invisible while the font loads). */
  fontsNoDisplay: string[];
}

/** One problem per field, as "label (what is wrong)". */
export interface FormsSummary {
  fields: number;
  /** Email, phone, number fields that bring up the plain text keyboard. */
  wrongKeyboard: string[];
  /** Name, email, address, phone… fields without autocomplete: the browser cannot fill them. */
  noAutocomplete: string[];
  /** Fields without an accessible name (label, aria-label). */
  noLabel: string[];
}

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AxeViolation {
  id: string;
  impact: AxeImpact;
  help: string;
  helpUrl: string;
  /** Number of elements concerned. */
  nodes: number;
  /** CSS selectors of a few of them. */
  targets: string[];
  /** Devices where it was found. */
  devices: string[];
}

export interface AxeSummary {
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
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
  /** Alternates fetched (return links); without it, only the tags of the page are checked. */
  hreflang?: HreflangReport | null;
  /** A fresh visit (no consent given): without it, the scripts of the HTML are read instead. */
  privacy?: PrivacyReport | null;
  /** Today, for the copyright year (tests). */
  now?: Date;
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
  {
    id: 'contenu',
    get label() {
      return t('Content', 'Contenu');
    },
  },
  { id: 'mobile', label: 'Mobile' },
  {
    id: 'accessibilite',
    get label() {
      return t('Accessibility', 'Accessibilité');
    },
  },
  {
    id: 'vie-privee',
    get label() {
      return t('Privacy', 'Vie privée');
    },
  },
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

/** A dev server on this computer (unminified code, no compression). */
function isDevServer(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h.startsWith('127.') || h === '[::1]' || h.endsWith('.local') || /^(10|192\.168)\./.test(h);
  } catch {
    return false;
  }
}

const kb = (b: number) => `${Math.round(b / 1024)} ${t('KB', 'Ko')}`;

/** "1.2 s" / "1,2 s", or ms under a second. */
const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${t((ms / 1000).toFixed(1), (ms / 1000).toFixed(1).replace('.', ','))} s`);

/** "1 image" / "2 images" (English; the French strings keep their own plural). */
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function runChecks({ meta, image, site, rendered, hreflang, privacy, now }: CheckInput): CheckResult[] {
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

  const sd = readStructuredData(meta.jsonLd ?? [], meta.jsonLdErrors ?? []);
  const sdLabel = t('Structured data', 'Données structurées');
  if (sd.errors.length) add('structured-data', 'seo', sdLabel, 'error', t(`Invalid JSON-LD: ${sd.errors[0]}`, `JSON-LD invalide : ${sd.errors[0]}`));
  else if (!sd.items.length) add('structured-data', 'seo', sdLabel, 'info', t('No JSON-LD: no rich results (stars, price, FAQ, breadcrumb) in Google.', 'Pas de JSON-LD : pas de résultats enrichis (étoiles, prix, FAQ, fil d’Ariane) dans Google.'));
  else {
    const broken = sd.items.filter((i) => i.missing.length);
    const poor = sd.items.filter((i) => !i.missing.length && i.recommended.length);
    const names = sd.items.map((i) => i.type).join(', ');
    add(
      'structured-data',
      'seo',
      sdLabel,
      broken.length ? 'error' : poor.length ? 'warning' : 'ok',
      broken.length
        ? t(`${broken[0]!.type}: missing ${broken[0]!.missing.join(', ')}.`, `${broken[0]!.type} : il manque ${broken[0]!.missing.join(', ')}.`)
        : poor.length
          ? t(`${names}. Recommended: ${poor[0]!.recommended.join(', ')} (${poor[0]!.type}).`, `${names}. Conseillé : ${poor[0]!.recommended.join(', ')} (${poor[0]!.type}).`)
          : t(`${names}: complete.`, `${names} : complet.`),
    );
  }
  const hl = hreflang?.issues ?? checkHreflangTags(meta);
  if (!meta.hreflang?.length) add('hreflang', 'seo', 'hreflang', 'info', t('One language: no hreflang needed.', 'Une seule langue : pas besoin de hreflang.'));
  else {
    const err = hl.filter((i) => i.severity === 'error');
    const langs = meta.hreflang.map((h) => h.lang).join(', ');
    add(
      'hreflang',
      'seo',
      'hreflang',
      err.length ? 'error' : hl.length ? 'warning' : 'ok',
      hl.length ? `${(err[0] ?? hl[0])!.message}${hl.length > 1 ? t(` (+${hl.length - 1} more)`, ` (+${hl.length - 1} autre${hl.length > 2 ? 's' : ''})`) : ''}` : hreflang?.checkedReturns ? t(`${langs}: consistent both ways.`, `${langs} : cohérents dans les deux sens.`) : `${langs}.`,
    );
  }

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

  // Content: what a site built in a hurry leaves behind. The rendered page when there is one (SPA), else the HTML.
  const pageContent = rendered?.find((r) => r.content)?.content ?? meta.content;
  if (pageContent) {
    const c = scanContent(pageContent);
    const list = (f: { sample: string; why: string }[], max = 3) => f.slice(0, max).map((x) => `${x.sample} (${x.why})`).join(' · ');
    add(
      'filler-text',
      'contenu',
      t('Filler text', 'Texte de remplissage'),
      c.lorem ? 'error' : c.filler.length ? 'warning' : 'ok',
      c.filler.length ? list(c.filler) : t('No lorem ipsum or template text.', 'Ni lorem ipsum ni texte de modèle.'),
    );
    add('fake-contacts', 'contenu', t('Contact details', 'Coordonnées'), c.contacts.length ? 'warning' : 'ok', c.contacts.length ? list(c.contacts) : t('No example e-mail, phone number or address.', 'Pas d’e-mail, de téléphone ou d’adresse d’exemple.'));
    add(
      'placeholder-links',
      'contenu',
      t('Placeholder links', 'Liens factices'),
      c.links.length ? 'warning' : 'ok',
      c.links.length ? `${n(c.links.length, t('link', 'lien'))}${t(': ', ' : ')}${list(c.links)}` : t('Every link goes somewhere.', 'Chaque lien mène quelque part.'),
    );
    add('demo-images', 'contenu', t('Demo images', 'Images de démonstration'), c.images.length ? 'warning' : 'ok', c.images.length ? list(c.images) : t('No placeholder image.', 'Aucune image de remplissage.'));
    const year = (now ?? new Date()).getFullYear();
    add(
      'copyright-year',
      'contenu',
      t('Copyright year', 'Année du copyright'),
      c.copyrightYear == null ? 'info' : c.copyrightYear < year ? 'warning' : 'ok',
      c.copyrightYear == null
        ? t('No © notice on the page.', 'Pas de mention © sur la page.')
        : c.copyrightYear < year
          ? t(`© ${c.copyrightYear}, we are in ${year}: write the year in code (new Date().getFullYear()).`, `© ${c.copyrightYear}, on est en ${year} : écris l’année dans le code (new Date().getFullYear()).`)
          : `© ${c.copyrightYear}.`,
    );
    const missing = [!c.legal.notice && t('legal notice', 'mentions légales'), !c.legal.privacy && t('privacy policy', 'politique de confidentialité')].filter((x): x is string => !!x);
    add(
      'legal-pages',
      'contenu',
      t('Legal pages', 'Pages légales'),
      missing.length ? 'warning' : 'ok',
      missing.length
        ? t(`No link to the ${missing.join(' or the ')} (required in the EU for a site that collects data or is run by a business).`, `Aucun lien vers ${missing.length > 1 ? 'les mentions légales ni la politique de confidentialité' : missing[0] === 'mentions légales' ? 'les mentions légales' : 'la politique de confidentialité'} (obligatoires en France pour un site professionnel ou qui collecte des données).`)
        : t(`Legal notice and privacy policy linked${c.legal.terms ? ', terms too' : ''}.`, `Mentions légales et politique de confidentialité liées${c.legal.terms ? ', conditions aussi' : ''}.`),
    );
  }

  // Privacy: what loads and is stored before the visitor says yes to anything.
  const priv = privacy ?? assessPrivacy(privacyFromHtml(meta.finalUrl, meta.resources ?? []));
  const fromHtml = priv.source === 'html';
  const names = (xs: { name: string }[]) => [...new Set(xs.map((x) => x.name))].join(', ');
  add(
    'trackers',
    'vie-privee',
    t('Trackers before consent', 'Traceurs avant consentement'),
    priv.trackers.length ? (fromHtml ? 'warning' : 'error') : 'ok',
    priv.trackers.length
      ? fromHtml
        ? t(`In the HTML: ${names(priv.trackers)}. Check they wait for consent.`, `Dans le HTML : ${names(priv.trackers)}. Vérifie qu’ils attendent le consentement.`)
        : t(`${names(priv.trackers)} load as soon as the page opens, before any consent.`, `${names(priv.trackers)} se chargent dès l’ouverture, avant tout consentement.`)
      : priv.exempt.length
        ? t(`None. Audience measurement without consent: ${names(priv.exempt)}.`, `Aucun. Mesure d’audience sans consentement : ${names(priv.exempt)}.`)
        : t('No tracker loads before consent.', 'Aucun traceur ne se charge avant consentement.'),
  );
  if (fromHtml) add('tracking-cookies', 'vie-privee', t('Cookies before consent', 'Cookies avant consentement'), 'skip', t('Measured in a fresh visit, in the app.', 'Mesuré lors d’une visite neuve, dans l’app.'));
  else
    add(
      'tracking-cookies',
      'vie-privee',
      t('Cookies before consent', 'Cookies avant consentement'),
      priv.trackingCookies.length ? 'error' : 'ok',
      priv.trackingCookies.length
        ? t(`${n(priv.trackingCookies.length, 'tracking cookie')} set without consent: ${priv.trackingCookies.slice(0, 5).map((c) => `${c.name}${c.vendor ? ` (${c.vendor})` : ''}`).join(', ')}.`, `${priv.trackingCookies.length} cookie${priv.trackingCookies.length > 1 ? 's' : ''} de suivi posé${priv.trackingCookies.length > 1 ? 's' : ''} sans consentement : ${priv.trackingCookies.slice(0, 5).map((c) => `${c.name}${c.vendor ? ` (${c.vendor})` : ''}`).join(', ')}.`)
        : priv.thirdPartyCookies.length
          ? t(`No tracking cookie. Other domains’ cookies: ${priv.thirdPartyCookies.slice(0, 4).map((c) => `${c.name} (${c.domain})`).join(', ')}.`, `Aucun cookie de suivi. Cookies d’autres domaines : ${priv.thirdPartyCookies.slice(0, 4).map((c) => `${c.name} (${c.domain})`).join(', ')}.`)
          : t('No tracking cookie before consent.', 'Aucun cookie de suivi avant consentement.'),
    );
  const needsConsent = priv.trackers.length > 0 || priv.trackingCookies.length > 0;
  const bannerLabel = t('Consent banner', 'Bannière de consentement');
  if (priv.banner?.visible && !priv.banner.reject)
    add('consent-banner', 'vie-privee', bannerLabel, 'warning', t(`${priv.cmp ? `${priv.cmp}: ` : ''}no “Reject” button next to “Accept”: refusing must be as easy as accepting.`, `${priv.cmp ? `${priv.cmp} : ` : ''}pas de bouton « Refuser » à côté de « Accepter » : refuser doit être aussi simple qu’accepter.`));
  else if (priv.cmp || priv.banner?.visible)
    add('consent-banner', 'vie-privee', bannerLabel, 'ok', priv.cmp ? t(`${priv.cmp}${priv.banner?.reject ? ', with a reject button' : ''}.`, `${priv.cmp}${priv.banner?.reject ? ', avec un bouton pour refuser' : ''}.`) : t('Banner shown, with a reject button.', 'Bannière affichée, avec un bouton pour refuser.'));
  else if (needsConsent)
    add('consent-banner', 'vie-privee', bannerLabel, fromHtml ? 'warning' : 'error', t('Trackers, and no consent banner: they need the visitor’s consent first.', 'Des traceurs, et aucune bannière de consentement : il faut l’accord du visiteur avant.'));
  else add('consent-banner', 'vie-privee', bannerLabel, 'info', t('No tracker: no banner needed.', 'Aucun traceur : pas besoin de bannière.'));
  add(
    'third-party-content',
    'vie-privee',
    t('Third-party content', 'Contenus tiers'),
    priv.embeds.length ? 'warning' : 'ok',
    priv.embeds.length ? priv.embeds.map((e) => `${e.name}${t(': ', ' : ')}${e.fix}`).join(' · ') : t('No font, video or map loaded from another company.', 'Aucune police, vidéo ou carte chargée chez une autre entreprise.'),
  );

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
  const zoomLabel = t('Large text', 'Texte agrandi');
  const zoomed = rendered?.filter((r) => (r.textScale ?? 1) > 1) ?? [];
  if (!zoomed.length) add('text-zoom', 'mobile', zoomLabel, 'skip', t('Turn on large text (Appearance menu) to measure.', 'Active le texte agrandi (menu Apparence) pour mesurer.'));
  else {
    const k = zoomed[0]!.textScale!;
    const fixed = zoomed.filter((r) => r.rootFontPx != null && Math.abs(r.rootFontPx - 16 * k) > 1 && Math.abs(r.rootFontPx - 16) < 1);
    const clipped = [...zoomed].sort((a, b) => (b.clippedText?.count ?? 0) - (a.clippedText?.count ?? 0))[0]!;
    const over = zoomed.filter((r) => r.overflowPx > 1);
    const problems: string[] = [];
    if (fixed.length) problems.push(t('the root font size is in px: text does not grow', 'la taille de police de base est en px : le texte ne grossit pas'));
    if (clipped.clippedText?.count) problems.push(t(`${clipped.clippedText.count} cut on ${clipped.label}: ${clipped.clippedText.examples.join(', ')}`, `${clipped.clippedText.count} coupé${clipped.clippedText.count > 1 ? 's' : ''} sur ${clipped.label} : ${clipped.clippedText.examples.join(', ')}`));
    if (over.length) problems.push(t(`overflows on ${over.map((r) => r.label).join(', ')}`, `déborde sur ${over.map((r) => r.label).join(', ')}`));
    add('text-zoom', 'mobile', zoomLabel, problems.length ? 'warning' : 'ok', problems.length ? `×${k}${t(': ', ' : ')}${problems.join(' · ')}` : t(`×${k}: text grows and nothing is cut.`, `×${k} : le texte grossit et rien n’est coupé.`));
  }
  const formDevices = rendered?.filter((r) => r.forms) ?? [];
  const formsLabel = t('Forms', 'Formulaires');
  if (!formDevices.length) add('forms', 'mobile', formsLabel, 'skip', inDevices);
  else {
    const f = [...formDevices].sort((a, b) => b.forms!.fields - a.forms!.fields)[0]!.forms!;
    const parts: string[] = [];
    if (f.wrongKeyboard.length) parts.push(t(`wrong keyboard: ${f.wrongKeyboard.slice(0, 3).join(', ')}`, `mauvais clavier : ${f.wrongKeyboard.slice(0, 3).join(', ')}`));
    if (f.noLabel.length) parts.push(t(`no label: ${f.noLabel.slice(0, 3).join(', ')}`, `sans label : ${f.noLabel.slice(0, 3).join(', ')}`));
    if (f.noAutocomplete.length) parts.push(t(`no autocomplete: ${f.noAutocomplete.slice(0, 3).join(', ')}`, `sans autocomplete : ${f.noAutocomplete.slice(0, 3).join(', ')}`));
    add(
      'forms',
      'mobile',
      formsLabel,
      !f.fields ? 'info' : f.wrongKeyboard.length || f.noLabel.length ? 'warning' : f.noAutocomplete.length ? 'warning' : 'ok',
      !f.fields
        ? t('No form on this page.', 'Aucun formulaire sur cette page.')
        : parts.length
          ? `${n(f.fields, t('field', 'champ'))}${t(': ', ' : ')}${parts.join(' · ')}`
          : t(`${n(f.fields, 'field')}: right keyboard, labels and autofill.`, `${f.fields} champ${f.fields > 1 ? 's' : ''} : bon clavier, labels et remplissage automatique.`),
    );
  }
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

  // Accessibility (axe-core in the devices, focus measured with the DevTools protocol)
  const withAxe = rendered?.filter((r) => r.axe) ?? [];
  const axeOf = (impacts: AxeImpact[]) => {
    const by = new Map<string, AxeViolation>();
    for (const r of withAxe) for (const v of r.axe!.violations) if (impacts.includes(v.impact)) by.set(v.id, by.has(v.id) ? { ...by.get(v.id)!, nodes: Math.max(by.get(v.id)!.nodes, v.nodes), devices: [...new Set([...by.get(v.id)!.devices, ...v.devices])] } : v);
    return [...by.values()].sort((a, b) => b.nodes - a.nodes);
  };
  const serious = t('Blocking problems', 'Problèmes bloquants');
  const minor = t('Other problems', 'Autres problèmes');
  if (!withAxe.length) {
    add('a11y-serious', 'accessibilite', serious, 'skip', inDevices);
    add('a11y-minor', 'accessibilite', minor, 'skip', inDevices);
  } else {
    const list = (vs: AxeViolation[]) => vs.slice(0, 3).map((v) => `${v.help} (${v.nodes})`).join(' · ');
    const s1 = axeOf(['critical', 'serious']);
    add('a11y-serious', 'accessibilite', serious, s1.length ? 'error' : 'ok', s1.length ? t(`${n(s1.length, 'rule')} broken: ${list(s1)}`, `${s1.length} règle${s1.length > 1 ? 's' : ''} non respectée${s1.length > 1 ? 's' : ''} : ${list(s1)}`) : t('Nothing critical or serious (axe-core).', 'Rien de critique ni de grave (axe-core).'));
    const s2 = axeOf(['moderate', 'minor']);
    add('a11y-minor', 'accessibilite', minor, s2.length ? 'warning' : 'ok', s2.length ? t(`${n(s2.length, 'rule')}: ${list(s2)}`, `${s2.length} règle${s2.length > 1 ? 's' : ''} : ${list(s2)}`) : t('No moderate or minor problem.', 'Aucun problème modéré ou mineur.'));
  }
  const focusDevices = rendered?.filter((r) => r.focusMissing) ?? [];
  const focusLabel = t('Visible focus', 'Focus visible');
  if (!focusDevices.length) add('focus-visible', 'accessibilite', focusLabel, 'skip', inDevices);
  else {
    const w = [...focusDevices].sort((a, b) => b.focusMissing!.count - a.focusMissing!.count)[0]!;
    const f = w.focusMissing!;
    add(
      'focus-visible',
      'accessibilite',
      focusLabel,
      f.count ? 'warning' : 'ok',
      f.count
        ? t(`${f.count} of ${f.total} elements show nothing when focused with Tab (${w.label}): ${f.examples.join(', ')}`, `${f.count} élément${f.count > 1 ? 's' : ''} sur ${f.total} ne montre${f.count > 1 ? 'nt' : ''} rien au focus clavier (${w.label}) : ${f.examples.join(', ')}`)
        : t(`The ${f.total} focusable elements show where the focus is.`, `Les ${f.total} éléments focusables montrent où est le focus.`),
    );
  }

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

  // Performance details (the slowest device decides).
  const withPerf = rendered?.filter((r) => r.performance) ?? [];
  const worstBy = <K extends keyof PerfDetails>(k: K) => [...withPerf].filter((r) => r.performance![k] != null).sort((a, b) => (b.performance![k] as number) - (a.performance![k] as number))[0];
  const inpLabel = t('Responsiveness (INP)', 'Réactivité (INP)');
  const inpDev = worstBy('inpMs');
  if (!inpDev) add('inp', 'technique', inpLabel, 'skip', withPerf.length ? t('Click, tap or type in a device to measure.', 'Clique, touche ou tape dans un appareil pour mesurer.') : inDevices);
  else {
    const ms = inpDev.performance!.inpMs!;
    add('inp', 'technique', inpLabel, ms > 500 ? 'error' : ms > 200 ? 'warning' : 'ok', t(`${secs(ms)} on ${inpDev.label}, ${n(inpDev.performance!.interactions, 'interaction')} (good under 200 ms).`, `${secs(ms)} sur ${inpDev.label}, ${inpDev.performance!.interactions} interaction${inpDev.performance!.interactions > 1 ? 's' : ''} (bon sous 200 ms).`));
  }
  const blockLabel = t('Main thread blocked', 'Fil principal bloqué');
  const blockDev = worstBy('blockingMs');
  if (!blockDev) add('main-thread', 'technique', blockLabel, 'skip', inDevices);
  else {
    const p = blockDev.performance!;
    const ms = p.blockingMs!;
    add(
      'main-thread',
      'technique',
      blockLabel,
      ms > 600 ? 'error' : ms > 200 ? 'warning' : 'ok',
      ms
        ? t(`${secs(ms)} blocked in ${n(p.longFrames, 'long task')} on ${blockDev.label} (good under 200 ms): the page does not answer meanwhile.`, `${secs(ms)} bloqués en ${p.longFrames} tâche${p.longFrames > 1 ? 's' : ''} longue${p.longFrames > 1 ? 's' : ''} sur ${blockDev.label} (bon sous 200 ms) : la page ne répond pas pendant ce temps.`)
        : t(`Never blocked on ${blockDev.label}.`, `Jamais bloqué sur ${blockDev.label}.`),
    );
  }
  const rbLabel = t('Render-blocking resources', 'Ressources bloquantes');
  if (!withPerf.length) add('render-blocking', 'technique', rbLabel, 'skip', inDevices);
  else {
    const rb = new Map<string, PerfDetails['renderBlocking'][number]>();
    for (const r of withPerf) for (const x of r.performance!.renderBlocking) if ((rb.get(x.url)?.ms ?? -1) < x.ms) rb.set(x.url, x);
    const all = [...rb.values()].sort((a, b) => b.ms - a.ms);
    const scripts = all.filter((x) => x.kind === 'js');
    const css = all.filter((x) => x.kind === 'css');
    const file = (u: string) => u.split('?')[0]!.split('/').filter(Boolean).pop() ?? u;
    add(
      'render-blocking',
      'technique',
      rbLabel,
      scripts.length || css.length > 2 ? 'warning' : 'ok',
      !all.length
        ? t('Nothing holds the first paint.', 'Rien ne retient le premier affichage.')
        : scripts.length
          ? t(`${n(scripts.length, 'script')} without defer or async hold the first paint: ${scripts.slice(0, 3).map((x) => `${file(x.url)} (${secs(x.ms)})`).join(', ')}.`, `${scripts.length} script${scripts.length > 1 ? 's' : ''} sans defer ni async retien${scripts.length > 1 ? 'nent' : 't'} le premier affichage : ${scripts.slice(0, 3).map((x) => `${file(x.url)} (${secs(x.ms)})`).join(', ')}.`)
          : t(`${n(css.length, 'stylesheet')} before the first paint${css.length > 2 ? ': merge or inline the critical CSS' : ''}: ${css.slice(0, 3).map((x) => file(x.url)).join(', ')}.`, `${css.length} feuille${css.length > 1 ? 's' : ''} de style avant le premier affichage${css.length > 2 ? ' : regroupe-les ou intègre le CSS critique' : ''} : ${css.slice(0, 3).map((x) => file(x.url)).join(', ')}.`),
    );
  }
  const jsLabel = t('JavaScript weight', 'Poids du JavaScript');
  const jsDev = worstBy('jsBytes');
  if (!jsDev) add('js-weight', 'technique', jsLabel, 'skip', inDevices);
  else {
    const p = jsDev.performance!;
    const top = p.jsFiles[0];
    const dev = isDevServer(meta.finalUrl);
    const heavy = p.jsBytes > 350 * 1024;
    add(
      'js-weight',
      'technique',
      jsLabel,
      heavy && dev ? 'info' : p.jsBytes > 1024 * 1024 ? 'error' : heavy ? 'warning' : 'ok',
      `${kb(p.jsBytes)}${t(' transferred', ' transférés')}${top ? t(`, the heaviest: ${top.url.split('?')[0]!.split('/').pop()} (${kb(top.bytes)})`, `, le plus lourd : ${top.url.split('?')[0]!.split('/').pop()} (${kb(top.bytes)})`) : ''}${heavy && dev ? t(': dev server, code not minified. Judge it on a preview.', ' : serveur de dev, code non minifié. À juger sur une preview.') : t(' (good under 350 KB).', ' (bon sous 350 Ko).')}`,
    );
  }
  const cssLabel = t('Unused CSS', 'CSS inutilisé');
  const cssDev = withPerf.find((r) => r.performance!.unusedCssBytes != null && r.performance!.cssRules > 0);
  if (!cssDev) add('unused-css', 'technique', cssLabel, 'skip', withPerf.length ? t('No stylesheet readable on this page.', 'Aucune feuille de style lisible sur cette page.') : inDevices);
  else {
    const p = cssDev.performance!;
    const total = Math.max(p.cssBytes, 1);
    const unused = p.unusedCssBytes!;
    const pct = Math.round((unused / total) * 100);
    add(
      'unused-css',
      'technique',
      cssLabel,
      unused > 50 * 1024 && pct > 60 ? 'warning' : 'ok',
      t(`${pct}% of the CSS matches nothing on this page (${kb(unused)} of ${kb(total)})${p.cssUnreadable ? `, ${n(p.cssUnreadable, 'stylesheet')} from other domains not read` : ''}.`, `${pct} % du CSS ne sert à rien sur cette page (${kb(unused)} sur ${kb(total)})${p.cssUnreadable ? `, ${p.cssUnreadable} feuille${p.cssUnreadable > 1 ? 's' : ''} d’autres domaines non lue${p.cssUnreadable > 1 ? 's' : ''}` : ''}.`),
    );
  }
  const fontLabel = t('Fonts', 'Polices');
  if (!withPerf.length) add('fonts', 'technique', fontLabel, 'skip', inDevices);
  else {
    const p = [...withPerf].sort((a, b) => b.performance!.fontBytes - a.performance!.fontBytes)[0]!.performance!;
    const noDisplay = [...new Set(withPerf.flatMap((r) => r.performance!.fontsNoDisplay))];
    const problems: string[] = [];
    if (noDisplay.length) problems.push(t(`no font-display on ${noDisplay.slice(0, 3).join(', ')}: text stays invisible while it loads`, `pas de font-display sur ${noDisplay.slice(0, 3).join(', ')} : le texte reste invisible pendant le chargement`));
    if (p.fontBytes > 300 * 1024) problems.push(t(`${kb(p.fontBytes)} of fonts (under 300 KB recommended)`, `${kb(p.fontBytes)} de polices (moins de 300 Ko conseillé)`));
    if (p.fontFiles > 6) problems.push(t(`${p.fontFiles} font files`, `${p.fontFiles} fichiers de police`));
    add(
      'fonts',
      'technique',
      fontLabel,
      problems.length ? 'warning' : 'ok',
      problems.length ? problems.join(' · ') : p.fontFiles ? t(`${n(p.fontFiles, 'file')}, ${kb(p.fontBytes)}, text shown while they load.`, `${p.fontFiles} fichier${p.fontFiles > 1 ? 's' : ''}, ${kb(p.fontBytes)}, texte affiché pendant le chargement.`) : t('System fonts only.', 'Polices du système seulement.'),
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
