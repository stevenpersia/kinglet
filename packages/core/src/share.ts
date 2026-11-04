import type { BotId } from './bots.ts';
import { probeImage, type ImageProbe } from './image.ts';
import { readPageMeta, type Framework, type PageMeta } from './meta.ts';
import { t } from './i18n.ts';

export type Platform = 'whatsapp' | 'imessage' | 'linkedin' | 'x' | 'slack' | 'discord' | 'google';
export type PlatformFamily = 'messagerie' | 'reseau' | 'recherche';

export const PLATFORMS: { id: Platform; label: string; bot: BotId; family: PlatformFamily }[] = [
  { id: 'whatsapp', label: 'WhatsApp', bot: 'whatsapp', family: 'messagerie' },
  { id: 'imessage', label: 'iMessage', bot: 'imessage', family: 'messagerie' },
  { id: 'slack', label: 'Slack', bot: 'slack', family: 'messagerie' },
  { id: 'discord', label: 'Discord', bot: 'discord', family: 'messagerie' },
  { id: 'linkedin', label: 'LinkedIn', bot: 'linkedin', family: 'reseau' },
  { id: 'x', label: 'X', bot: 'twitter', family: 'reseau' },
  { id: 'google', label: 'Google', bot: 'google', family: 'recherche' },
];

/**
 * What each platform shows. Limits are approximations: platforms change their layouts
 * and often cut by pixel width, not by characters.
 */
const RULES: Record<Platform, { title: number; description: number | null; showsSiteName: boolean }> = {
  whatsapp: { title: 70, description: 80, showsSiteName: false },
  imessage: { title: 60, description: null, showsSiteName: false },
  slack: { title: 120, description: 300, showsSiteName: true },
  discord: { title: 100, description: 350, showsSiteName: true },
  linkedin: { title: 70, description: null, showsSiteName: false },
  x: { title: 70, description: null, showsSiteName: false },
  google: { title: 60, description: 155, showsSiteName: true },
};

export type CardStatus = 'ok' | 'warning' | 'error';

export interface ShareCard {
  platform: Platform;
  label: string;
  family: PlatformFamily;
  /** HTTP status seen by this platform's bot (null: unreachable). */
  httpStatus: number | null;
  /** large: big image above the text; small: thumbnail; text: no image; serp: search result. */
  layout: 'large' | 'small' | 'text' | 'serp';
  siteName: string;
  domain: string;
  url: string;
  title: string | null;
  titleCut: boolean;
  description: string | null;
  descriptionCut: boolean;
  image: string | null;
  icon: string | null;
  /** Discord colours the card border with theme-color. */
  accent: string | null;
  problems: string[];
  status: CardStatus;
}

export interface SharePreviews {
  url: string;
  framework: Framework;
  /** Meta as seen by the WhatsApp bot (reference for the tag table and the fix). */
  meta: PageMeta;
  image: ImageProbe | null;
  cards: ShareCard[];
}

function cut(text: string | null, max: number | null): { text: string | null; cut: boolean } {
  if (!text || max == null) return { text: max == null ? null : text, cut: false };
  if (text.length <= max) return { text, cut: false };
  return { text: `${text.slice(0, max - 1).trimEnd()}…`, cut: true };
}

export function buildCard(platform: Platform, meta: PageMeta | null, image: ImageProbe | null, error?: string): ShareCard {
  const p = PLATFORMS.find((x) => x.id === platform)!;
  const rules = RULES[platform];
  const url = meta?.finalUrl ?? '';
  let domain = '';
  try {
    domain = new URL(url).host.replace(/^www\./, '');
  } catch {
    /* unknown */
  }
  const base = { platform, label: p.label, family: p.family, url, domain, accent: null, icon: null };
  if (!meta || meta.status >= 400) {
    return {
      ...base,
      httpStatus: meta?.status ?? null,
      layout: 'text',
      siteName: domain,
      title: null,
      titleCut: false,
      description: null,
      descriptionCut: false,
      image: null,
      problems: [
        meta
          ? t(`The bot gets an HTTP ${meta.status} error: no preview.`, `Le robot reçoit une erreur HTTP ${meta.status} : pas d’aperçu.`)
          : t(`The bot cannot reach the page (${error ?? 'network error'}).`, `Le robot n’atteint pas la page (${error ?? 'erreur réseau'}).`),
      ],
      status: 'error',
    };
  }

  const problems: string[] = [];
  const rawTitle = meta.og['title'] ?? meta.twitter['title'] ?? meta.title;
  const rawDesc = meta.og['description'] ?? meta.twitter['description'] ?? meta.description;
  const title = cut(platform === 'google' ? (meta.title ?? rawTitle) : rawTitle, rules.title);
  const description = cut(platform === 'google' ? (meta.description ?? rawDesc) : rawDesc, rules.description);
  if (!rawTitle) problems.push(t('No title: only the URL will be shown.', 'Aucun titre : seule l’URL sera affichée.'));
  if (title.cut) problems.push(t(`Title cut around ${rules.title} characters.`, `Titre coupé vers ${rules.title} caractères.`));
  if (description.cut) problems.push(t(`Description cut around ${rules.description} characters.`, `Description coupée vers ${rules.description} caractères.`));
  if (rules.description != null && !rawDesc) problems.push(t('No description.', 'Aucune description.'));
  const siteName = meta.og['site_name'] ?? domain;
  if (rules.showsSiteName && !meta.og['site_name']) problems.push(t(`No og:site_name: shows “${domain}”.`, `Pas d’og:site_name : affiche « ${domain} ».`));

  // Image
  const imgUrl = platform === 'x' ? (meta.twitter['image'] ? new URL(meta.twitter['image'], url).toString() : meta.ogImageUrl) : meta.ogImageUrl;
  const usable = !!imgUrl && !!image?.ok;
  if (!imgUrl) problems.push(t('No share image.', 'Pas d’image de partage.'));
  else if (!image?.ok) problems.push(t(`Image unreachable (${image?.error ?? 'error'}).`, `Image inaccessible (${image?.error ?? 'erreur'}).`));
  else if (meta.ogImageIsRelative && imgUrl === meta.ogImageUrl) problems.push(t('Relative image URL: this bot may ignore it.', 'URL d’image relative : ce robot risque de l’ignorer.'));
  const ratio = image?.width && image.height ? image.width / image.height : null;
  const big = usable && (image!.width ?? 0) >= 300;

  let layout: ShareCard['layout'] = usable ? (big ? 'large' : 'small') : 'text';
  if (platform === 'google') layout = 'serp';
  if (platform === 'x') {
    const card = meta.twitter['card'];
    if (!card) problems.push(t('No twitter:card: X shows a small card.', 'Pas de twitter:card : X affiche une petite carte.'));
    layout = usable ? (card === 'summary_large_image' ? 'large' : 'small') : 'text';
  }
  if ((platform === 'linkedin' || (platform === 'x' && layout === 'large')) && ratio && Math.abs(ratio - 1.91) / 1.91 > 0.1) {
    problems.push(t(`Image cropped to 1.91:1 (it is ${ratio.toFixed(2)}:1).`, `Image recadrée en 1,91:1 (elle fait ${ratio.toFixed(2)}:1).`));
  }
  if (platform === 'whatsapp' && image?.ok && (image.bytes ?? 0) > 300 * 1024) problems.push(t('Heavy image: WhatsApp may ignore it (under 300 KB recommended).', 'Image lourde : WhatsApp peut l’ignorer (moins de 300 Ko conseillé).'));
  if (platform === 'discord' && !meta.themeColor) problems.push(t('No theme-color: grey border by default.', 'Pas de theme-color : bordure grise par défaut.'));

  const icon = platform === 'google' || platform === 'imessage' ? (meta.appleTouchIcon ?? meta.icons[0] ?? null) : null;
  const severe = !rawTitle || (!imgUrl && platform !== 'google') || (!!imgUrl && !image?.ok);
  return {
    ...base,
    httpStatus: meta.status,
    layout,
    siteName,
    title: title.text,
    titleCut: title.cut,
    description: description.text,
    descriptionCut: description.cut,
    image: usable ? imgUrl : null,
    icon,
    accent: platform === 'discord' ? meta.themeColor : null,
    problems,
    status: severe ? 'error' : problems.length ? 'warning' : 'ok',
  };
}

/** Fetch the page once per bot (sites sometimes answer bots differently) and build the 7 cards. */
export async function readSharePreviews(url: string, opts: { headers?: Record<string, string>; fetchImpl?: typeof fetch } = {}): Promise<SharePreviews> {
  const results = await Promise.all(
    PLATFORMS.map(async (p) => {
      try {
        return { p, meta: await readPageMeta(url, { bot: p.bot, headers: opts.headers, fetchImpl: opts.fetchImpl }) };
      } catch (e) {
        return { p, meta: null, error: (e as Error).message };
      }
    }),
  );
  const ref = results.find((r) => r.p.id === 'whatsapp')?.meta ?? results.find((r) => r.meta)?.meta;
  if (!ref) throw new Error(results[0]?.error ?? t('page unreachable', 'page injoignable'));

  // Probe each distinct image once.
  const imageUrls = [...new Set(results.flatMap((r) => [r.meta?.ogImageUrl, r.meta?.twitter['image'] && r.meta ? new URL(r.meta.twitter['image'], r.meta.finalUrl).toString() : null]).filter((u): u is string => !!u))];
  const probes = new Map(await Promise.all(imageUrls.map(async (u) => [u, await probeImage(u, { headers: opts.headers, fetchImpl: opts.fetchImpl })] as const)));
  const imageFor = (meta: PageMeta | null, platform: Platform) => {
    if (!meta) return null;
    const u = platform === 'x' && meta.twitter['image'] ? new URL(meta.twitter['image'], meta.finalUrl).toString() : meta.ogImageUrl;
    return u ? (probes.get(u) ?? null) : null;
  };

  return {
    url,
    framework: ref.framework,
    meta: ref,
    image: ref.ogImageUrl ? (probes.get(ref.ogImageUrl) ?? null) : null,
    cards: results.map((r) => buildCard(r.p.id, r.meta, imageFor(r.meta, r.p.id), 'error' in r ? r.error : undefined)),
  };
}
