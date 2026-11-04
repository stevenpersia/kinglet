import type { ImageProbe } from './image.ts';
import type { Framework, PageMeta } from './meta.ts';

export interface ShareFix {
  framework: Framework;
  frameworkLabel: string;
  /** Where the code most likely goes. */
  file: string;
  language: 'tsx' | 'ts' | 'vue' | 'astro' | 'svelte' | 'html';
  code: string;
  /** What the fix changes, in plain words (empty: nothing to fix). */
  changes: string[];
  /** Ready to paste into Claude. */
  prompt: string;
}

const LABEL: Record<Framework, string> = {
  next: 'Next.js',
  nuxt: 'Nuxt',
  astro: 'Astro',
  sveltekit: 'SvelteKit',
  remix: 'Remix / React Router',
  vite: 'Vite',
  html: 'HTML',
};

const ADDED = '← ajouté';
const isLocal = (u: string) => /^https?:\/\/(localhost|127\.|\[::1\])/.test(u);

const squash = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Site name from a title like "Page — Site" or "Site — Tagline":
 * the part that matches the domain, else the first part on the home page, else the last one.
 */
export function guessSiteName(meta: PageMeta): string {
  if (meta.og['site_name']) return meta.og['site_name'];
  const parts = (meta.title ?? '').split(/\s+[—–|·-]\s+/).map((p) => p.trim()).filter(Boolean);
  let url: URL | null = null;
  try {
    url = new URL(meta.finalUrl);
  } catch {
    /* no URL */
  }
  const label = url && !isLocal(meta.finalUrl) ? url.hostname.replace(/^www\./, '').split('.')[0]! : null;
  if (label) {
    const match = parts.find((p) => squash(p) === squash(label));
    if (match) return match;
  }
  if (parts.length > 1) return url?.pathname === '/' ? parts[0]! : parts[parts.length - 1]!;
  if (label) return label.replace(/^./, (c) => c.toUpperCase());
  return parts[0] ?? '[NOM DU SITE]';
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function buildShareFix(meta: PageMeta, image: ImageProbe | null): ShareFix {
  const framework = meta.framework;
  const title = meta.og['title'] ?? meta.title ?? '[TITRE]';
  const description = meta.og['description'] ?? meta.description ?? '[DESCRIPTION, 150 CARACTÈRES MAX]';
  const siteName = guessSiteName(meta);
  // Production origin: the canonical URL if it is absolute and public, else a placeholder.
  let prodOrigin = 'https://[TON-DOMAINE]';
  if (meta.canonical && !isLocal(meta.canonical)) prodOrigin = new URL(meta.canonical).origin;
  else if (!isLocal(meta.finalUrl) && !/\.vercel\.app$/.test(new URL(meta.finalUrl).hostname)) prodOrigin = new URL(meta.finalUrl).origin;

  const imagePath = meta.ogImageUrl ? new URL(meta.ogImageUrl).pathname : '/og.png';
  const needImage = !meta.ogImageUrl || !image?.ok || (image.width ?? 0) < 1200 || (image.height ?? 0) < 630;

  const changes: string[] = [];
  if (!meta.og['title']) changes.push('ajouter og:title');
  if (!meta.og['description']) changes.push('ajouter og:description');
  if (!meta.og['site_name']) changes.push(`ajouter og:site_name (« ${siteName} »)`);
  if (!meta.ogImageUrl) changes.push('ajouter une image de partage 1200×630');
  else if (meta.ogImageIsRelative) changes.push('rendre l’URL de l’image absolue');
  if (meta.ogImageUrl && needImage && image?.ok) changes.push(`remplacer l’image ${image.width}×${image.height} par une image 1200×630`);
  if (!meta.twitter['card']) changes.push('ajouter twitter:card = summary_large_image');
  if (!meta.description) changes.push('ajouter une meta description');

  const mark = (missing: boolean) => (missing ? `  // ${ADDED}` : '');
  const markHtml = (missing: boolean) => (missing ? ` <!-- ${ADDED} -->` : '');
  const absImage = `${prodOrigin}${imagePath}`;

  let file: string;
  let language: ShareFix['language'];
  let code: string;

  switch (framework) {
    case 'next':
      file = 'app/layout.tsx (ou la page concernée)';
      language = 'tsx';
      code = [
        `import type { Metadata } from 'next';`,
        ``,
        `export const metadata: Metadata = {`,
        `  metadataBase: new URL(${q(prodOrigin)}),${mark(meta.ogImageIsRelative || !meta.ogImageUrl)}`,
        `  title: ${q(meta.title ?? title)},`,
        `  description: ${q(meta.description ?? description)},${mark(!meta.description)}`,
        `  openGraph: {`,
        `    title: ${q(title)},${mark(!meta.og['title'])}`,
        `    description: ${q(description)},${mark(!meta.og['description'])}`,
        `    siteName: ${q(siteName)},${mark(!meta.og['site_name'])}`,
        `    images: [{ url: ${q(imagePath)}, width: 1200, height: 630 }],${mark(needImage || meta.ogImageIsRelative)}`,
        `    type: 'website',`,
        `  },`,
        `  twitter: { card: 'summary_large_image' },${mark(!meta.twitter['card'])}`,
        `};`,
      ].join('\n');
      break;
    case 'nuxt':
      file = 'app.vue (ou la page concernée)';
      language = 'vue';
      code = [
        `<script setup lang="ts">`,
        `useSeoMeta({`,
        `  title: ${q(meta.title ?? title)},`,
        `  description: ${q(meta.description ?? description)},${mark(!meta.description)}`,
        `  ogTitle: ${q(title)},${mark(!meta.og['title'])}`,
        `  ogDescription: ${q(description)},${mark(!meta.og['description'])}`,
        `  ogSiteName: ${q(siteName)},${mark(!meta.og['site_name'])}`,
        `  ogImage: ${q(absImage)},${mark(needImage || meta.ogImageIsRelative)}`,
        `  twitterCard: 'summary_large_image',${mark(!meta.twitter['card'])}`,
        `});`,
        `</script>`,
      ].join('\n');
      break;
    case 'sveltekit':
      file = 'src/routes/+layout.svelte (ou la page concernée)';
      language = 'svelte';
      code = htmlTags('<svelte:head>', '</svelte:head>');
      break;
    case 'astro':
      file = 'src/layouts/Layout.astro, dans <head>';
      language = 'astro';
      code = htmlTags('', '');
      break;
    default:
      file = framework === 'vite' || framework === 'html' ? 'index.html, dans <head>' : 'le <head> de la page';
      language = 'html';
      code = htmlTags('', '');
  }

  function htmlTags(open: string, close: string) {
    const ind = open ? '  ' : '';
    const lines = [
      `<meta name="description" content="${attr(meta.description ?? description)}">${markHtml(!meta.description)}`,
      `<meta property="og:title" content="${attr(title)}">${markHtml(!meta.og['title'])}`,
      `<meta property="og:description" content="${attr(description)}">${markHtml(!meta.og['description'])}`,
      `<meta property="og:site_name" content="${attr(siteName)}">${markHtml(!meta.og['site_name'])}`,
      `<meta property="og:image" content="${attr(absImage)}">${markHtml(needImage || meta.ogImageIsRelative)}`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">${markHtml(!meta.twitter['card'])}`,
    ].map((l) => ind + l);
    return [open, ...lines, close].filter((l) => l !== '').join('\n');
  }

  const path = new URL(meta.finalUrl).pathname;
  const prompt = changes.length
    ? [
        `Sur mon site (${LABEL[framework]}), les aperçus de lien de la page ${path} sont incomplets quand on la partage (WhatsApp, Slack, LinkedIn…).`,
        ``,
        `À corriger :`,
        ...changes.map((c) => `- ${c}`),
        ``,
        `Code de référence pour ${file} :`,
        '```' + language,
        code,
        '```',
        ``,
        `Contraintes :`,
        `- ne change ni le design ni le contenu visible ;`,
        `- garde les titres et descriptions existants s’ils sont bons ;`,
        `- les URL d’image doivent être absolues${prodOrigin.includes('[') ? ' (demande-moi le domaine de production si tu ne le trouves pas dans le projet)' : ` (domaine : ${prodOrigin})`} ;`,
        ...(needImage ? [`- crée l’image de partage en 1200×630, moins de 300 Ko${framework === 'next' ? ' (ou génère-la avec next/og dans app/opengraph-image.tsx)' : ''}, à partir du visuel principal de la page ;`] : []),
        `- dis-moi quels fichiers tu as modifiés.`,
      ].join('\n')
    : '';

  return { framework, frameworkLabel: LABEL[framework], file, language, code, changes, prompt };
}
