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
  if (!meta.og['site_name']) add('og-site-name-missing', 'error', 'og:site_name', 'Absent : WhatsApp et Slack n’affichent pas le nom du site.');

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
