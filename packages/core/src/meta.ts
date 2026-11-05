import { fetchExplained } from './net.ts';
import { parse } from 'node-html-parser';
import { BOTS, type BotId } from './bots.ts';

export type Framework = 'next' | 'nuxt' | 'astro' | 'sveltekit' | 'remix' | 'vite' | 'html';

/** Guess the framework from the HTML it produced. */
export function detectFramework(html: string): Framework {
  if (/__NEXT_DATA__|\/_next\/static|self\.__next_f|next-route-announcer/.test(html)) return 'next';
  if (/__NUXT__|\/_nuxt\//.test(html)) return 'nuxt';
  if (/<meta[^>]+generator[^>]+Astro|astro-island|\/_astro\//.test(html)) return 'astro';
  if (/__sveltekit|data-sveltekit/.test(html)) return 'sveltekit';
  if (/__remixContext|__reactRouterContext/.test(html)) return 'remix';
  if (/\/@vite\/client|<script[^>]+type="module"[^>]+src="\/src\//.test(html)) return 'vite';
  return 'html';
}

export interface PageMeta {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  fetchedAs: BotId;
  durationMs: number;
  title: string | null;
  description: string | null;
  lang: string | null;
  viewport: string | null;
  canonical: string | null;
  themeColor: string | null;
  icons: string[];
  appleTouchIcon: string | null;
  manifest: string | null;
  /** <meta name="robots"> content. */
  robotsMeta: string | null;
  /** X-Robots-Tag response header (Vercel sets it on preview deployments). */
  robotsHeader: string | null;
  h1Count: number;
  imgCount: number;
  imgMissingAlt: number;
  /** Same-origin links found in the raw HTML. */
  links: string[];
  /** Same-origin links that point at a fragment (#id), full URL with the hash. */
  hashLinks: string[];
  /** Fragment targets in the raw HTML: id attributes and <a name>. */
  ids: string[];
  /** JSON-LD blocks (<script type="application/ld+json">), parsed; a block that fails to parse is in jsonLdErrors. */
  jsonLd: unknown[];
  jsonLdErrors: string[];
  /** <link rel="alternate" hreflang> (href resolved). */
  hreflang: { lang: string; href: string }[];
  framework: Framework;
  /** og:* properties, keys without the "og:" prefix. */
  og: Record<string, string>;
  /** twitter:* properties, keys without the "twitter:" prefix. */
  twitter: Record<string, string>;
  /** og:image resolved against the final URL, when present. */
  ogImageUrl: string | null;
  /** true when og:image is not an absolute http(s) URL (bots need absolute URLs). */
  ogImageIsRelative: boolean;
}

export interface FetchOptions {
  bot?: BotId;
  /** Extra headers, e.g. the Vercel protection bypass. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const clean = (v: string | undefined | null): string | null => {
  if (v == null) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
};

export function parseMeta(html: string, baseUrl: string): Omit<PageMeta, 'requestedUrl' | 'finalUrl' | 'status' | 'contentType' | 'fetchedAs' | 'durationMs' | 'robotsHeader'> {
  const root = parse(html, { lowerCaseTagName: true });
  const head = root.querySelector('head') ?? root;

  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  let description: string | null = null;
  let viewport: string | null = null;
  let themeColor: string | null = null;
  let robotsMeta: string | null = null;

  for (const m of head.querySelectorAll('meta')) {
    const key = (m.getAttribute('property') ?? m.getAttribute('name') ?? '').trim().toLowerCase();
    const content = clean(m.getAttribute('content'));
    if (!key || content == null) continue;
    if (key.startsWith('og:')) {
      const k = key.slice(3);
      if (!(k in og)) og[k] = content; // first one wins, like most crawlers
    } else if (key.startsWith('twitter:')) {
      const k = key.slice(8);
      if (!(k in twitter)) twitter[k] = content;
    } else if (key === 'description' && description == null) description = content;
    else if (key === 'viewport' && viewport == null) viewport = content;
    else if (key === 'theme-color' && themeColor == null) themeColor = content;
    else if (key === 'robots' && robotsMeta == null) robotsMeta = content;
  }

  const resolve = (href: string | null): string | null => {
    if (!href) return null;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  };

  const icons = head
    .querySelectorAll('link')
    .filter((l) => /(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/i.test(l.getAttribute('rel') ?? ''))
    .map((l) => resolve(l.getAttribute('href') ?? null))
    .filter((u): u is string => !!u);

  const linkByRel = (rel: string) => head.querySelectorAll('link').find((l) => (l.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes(rel));
  const canonicalEl = linkByRel('canonical');
  const imgs = root.querySelectorAll('img');
  const origin = (() => {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return null;
    }
  })();
  const links = [
    ...new Set(
      root
        .querySelectorAll('a[href]')
        .map((a) => resolve(a.getAttribute('href') ?? null))
        .filter((u): u is string => !!u && !!origin && u.startsWith(origin))
        .map((u) => u.split('#')[0]!),
    ),
  ];
  const hashLinks = [
    ...new Set(
      root
        .querySelectorAll('a[href*="#"]')
        .map((a) => resolve(a.getAttribute('href') ?? null))
        .filter((u): u is string => !!u && !!origin && u.startsWith(origin) && /#./.test(u)),
    ),
  ];
  const ids = [...new Set([...root.querySelectorAll('[id]').map((e) => e.getAttribute('id') ?? ''), ...root.querySelectorAll('a[name]').map((e) => e.getAttribute('name') ?? '')].filter(Boolean))];
  const jsonLd: unknown[] = [];
  const jsonLdErrors: string[] = [];
  for (const sc of root.querySelectorAll('script')) {
    if ((sc.getAttribute('type') ?? '').trim().toLowerCase() !== 'application/ld+json') continue;
    const raw = sc.rawText.trim();
    if (!raw) continue;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch (e) {
      jsonLdErrors.push((e as Error).message);
    }
  }
  const hreflang = head
    .querySelectorAll('link')
    .filter((l) => (l.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('alternate') && l.getAttribute('hreflang'))
    .map((l) => ({ lang: (l.getAttribute('hreflang') ?? '').trim(), href: resolve(l.getAttribute('href') ?? null) ?? (l.getAttribute('href') ?? '') }));
  const rawImage = og['image'] ?? og['image:url'] ?? og['image:secure_url'] ?? null;

  return {
    title: clean(head.querySelector('title')?.text),
    description,
    lang: clean(root.querySelector('html')?.getAttribute('lang')),
    viewport,
    canonical: resolve(canonicalEl?.getAttribute('href') ?? null),
    themeColor,
    icons,
    appleTouchIcon: resolve(linkByRel('apple-touch-icon')?.getAttribute('href') ?? null),
    manifest: resolve(linkByRel('manifest')?.getAttribute('href') ?? null),
    robotsMeta,
    h1Count: root.querySelectorAll('h1').length,
    imgCount: imgs.length,
    imgMissingAlt: imgs.filter((i) => i.getAttribute('alt') == null).length,
    links,
    hashLinks,
    ids,
    jsonLd,
    jsonLdErrors,
    hreflang,
    framework: detectFramework(html),
    og,
    twitter,
    ogImageUrl: resolve(rawImage),
    ogImageIsRelative: rawImage != null && !/^https?:\/\//i.test(rawImage),
  };
}

/** Fetch a page the way a link-preview bot does (raw HTML, no JavaScript) and extract its tags. */
export async function readPageMeta(url: string, opts: FetchOptions = {}): Promise<PageMeta> {
  const bot = opts.bot ?? 'whatsapp';
  const f = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const res = await fetchExplained(f, url, {
    redirect: 'follow',
    headers: { 'user-agent': BOTS[bot], accept: 'text/html,*/*;q=0.8', ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
  });
  const html = await res.text();
  const finalUrl = res.url || url;
  return {
    requestedUrl: url,
    finalUrl,
    status: res.status,
    contentType: res.headers.get('content-type'),
    fetchedAs: bot,
    durationMs: Date.now() - started,
    robotsHeader: res.headers.get('x-robots-tag'),
    ...parseMeta(html, finalUrl),
  };
}
