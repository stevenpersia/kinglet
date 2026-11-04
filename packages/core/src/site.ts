import { BOTS } from './bots.ts';

export interface SiteFiles {
  robots: { status: number | null; disallowAll: boolean; sitemaps: string[] } | null;
  sitemap: { url: string; status: number | null; urls: string[]; error: string | null } | null;
  manifest: { url: string; status: number | null; name: string | null; icons: number; error: string | null } | null;
  favicon: { url: string; status: number | null } | null;
}

interface Opts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface Got {
  status: number | null;
  body: string;
  error: string | null;
  /** The server answered with an HTML page (dev servers do that for any unknown path). */
  html: boolean;
}

async function get(url: string, opts: Opts): Promise<Got> {
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      redirect: 'follow',
      headers: { 'user-agent': BOTS.google, ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    const body = res.ok ? await res.text() : '';
    const html = (res.headers.get('content-type') ?? '').includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(body);
    return { status: res.status, body, error: res.ok ? null : `HTTP ${res.status}`, html };
  } catch (e) {
    return { status: null, body: '', error: (e as Error).message, html: false };
  }
}

/** robots.txt: does a `User-agent: *` group contain `Disallow: /`? Which sitemaps does it list? */
export function parseRobots(body: string): { disallowAll: boolean; sitemaps: string[] } {
  const sitemaps: string[] = [];
  let inStar = false;
  let groupStarted = false;
  let disallowAll = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k!.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') {
      if (groupStarted) inStar = false;
      groupStarted = false;
      if (value === '*') inStar = true;
    } else {
      groupStarted = true;
      if (inStar && key === 'disallow' && value === '/') disallowAll = true;
    }
  }
  return { disallowAll, sitemaps };
}

/** <loc> entries of a sitemap (or of a sitemap index). */
export function parseSitemap(body: string): string[] {
  return [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, '&'));
}

/** Fetch the site-wide files once per origin. */
export async function readSiteFiles(pageUrl: string, refs: { manifest: string | null; favicon: string | null }, opts: Opts = {}): Promise<SiteFiles> {
  const origin = new URL(pageUrl).origin;
  const robotsRes = await get(`${origin}/robots.txt`, opts);
  // An HTML answer is the dev server's fallback page, not a robots.txt.
  const robots =
    robotsRes.status === 200 && !robotsRes.html ? { status: 200, ...parseRobots(robotsRes.body) } : { status: robotsRes.status === 200 ? 404 : robotsRes.status, disallowAll: false, sitemaps: [] };

  const sitemapUrl = robots.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const [sitemapRes, manifestRes, faviconRes] = await Promise.all([
    get(sitemapUrl, opts),
    refs.manifest ? get(refs.manifest, opts) : Promise.resolve(null),
    get(refs.favicon ?? `${origin}/favicon.ico`, opts),
  ]);

  let sitemap: SiteFiles['sitemap'] = { url: sitemapUrl, status: sitemapRes.status, urls: [], error: sitemapRes.error };
  if (sitemapRes.status === 200) {
    const urls = parseSitemap(sitemapRes.body);
    // A dev server often answers every path with index.html: that is not a sitemap.
    sitemap = urls.length ? { ...sitemap, urls } : { ...sitemap, error: sitemapRes.html ? 'absent' : 'aucune URL' };
  }

  let manifest: SiteFiles['manifest'] = null;
  if (refs.manifest && manifestRes) {
    manifest = { url: refs.manifest, status: manifestRes.status, name: null, icons: 0, error: manifestRes.error };
    if (manifestRes.status === 200) {
      try {
        const m = JSON.parse(manifestRes.body) as { name?: string; short_name?: string; icons?: unknown[] };
        manifest = { ...manifest, name: m.name ?? m.short_name ?? null, icons: Array.isArray(m.icons) ? m.icons.length : 0 };
      } catch {
        manifest = { ...manifest, error: 'JSON invalide' };
      }
    }
  }

  return {
    robots,
    sitemap,
    manifest,
    favicon: { url: refs.favicon ?? `${origin}/favicon.ico`, status: faviconRes.status === 200 && faviconRes.html ? 404 : faviconRes.status },
  };
}
