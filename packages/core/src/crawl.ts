import { readPageMeta, type FetchOptions } from './meta.ts';

export interface CrawledPage {
  url: string;
  path: string;
  status: number | null;
  title: string | null;
}

const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|mp4|webm|mp3|woff2?|ttf)$/i;

function normalize(u: string, origin: string): string | null {
  try {
    const url = new URL(u, origin);
    if (url.origin !== origin || ASSET.test(url.pathname)) return null;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Breadth-first exploration of a site's pages, same origin only, raw HTML (like a crawler).
 * `seeds` adds URLs found elsewhere: the sitemap, or links read in the rendered page (SPAs).
 */
export async function crawl(start: string, opts: FetchOptions & { limit?: number; seeds?: string[]; concurrency?: number } = {}): Promise<CrawledPage[]> {
  const origin = new URL(start).origin;
  const limit = opts.limit ?? 40;
  const queue: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const n = normalize(u, origin);
    if (n && !seen.has(n) && seen.size < limit) {
      seen.add(n);
      queue.push(n);
    }
  };
  push(start);
  for (const s of opts.seeds ?? []) push(s);

  const pages: CrawledPage[] = [];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const meta = await readPageMeta(url, { ...opts, bot: 'google' });
        pages.push({ url, path: new URL(url).pathname, status: meta.status, title: meta.title });
        if ((meta.contentType ?? '').includes('html')) for (const l of meta.links) push(l);
      } catch {
        pages.push({ url, path: new URL(url).pathname, status: null, title: null });
      }
    }
  };
  // Workers stop when the queue is momentarily empty; loop until nothing new was found.
  while (queue.length) await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}
