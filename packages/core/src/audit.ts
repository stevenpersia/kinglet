import { readPageMeta, type FetchOptions, type PageMeta } from './meta.ts';
import { runChecks, score, type CheckResult } from './checks.ts';
import type { SiteFiles } from './site.ts';
import { t } from './i18n.ts';

/**
 * Site-wide audit: every page found (links, sitemap, rendered links) read like Google,
 * the checks that can run without the devices, plus what only shows across pages:
 * broken links, dead anchors, duplicate titles and descriptions, pages missing from the sitemap, one-way hreflang.
 */

export interface AuditPage {
  url: string;
  path: string;
  status: number | null;
  title: string | null;
  description: string | null;
  /** null: not an HTML page or unreachable. */
  score: { passed: number; total: number } | null;
  errors: number;
  warnings: number;
  /** Checks that failed on this page. */
  problems: Pick<CheckResult, 'id' | 'label' | 'status' | 'detail'>[];
  noindex: boolean;
  inSitemap: boolean;
}

export interface BrokenLink {
  /** The URL linked to (with its #fragment for an anchor). */
  url: string;
  path: string;
  kind: 'page' | 'anchor';
  status: number | null;
  /** Pages that contain the link (paths). */
  from: string[];
}

export interface Duplicate {
  value: string;
  paths: string[];
}

export interface SiteAudit {
  origin: string;
  at: number;
  pages: AuditPage[];
  brokenLinks: BrokenLink[];
  duplicateTitles: Duplicate[];
  duplicateDescriptions: Duplicate[];
  /** Indexable pages found by the crawl but missing from the sitemap. */
  notInSitemap: string[];
  /** URLs of the sitemap that answer an error. */
  sitemapBroken: { url: string; status: number | null }[];
  hreflang: { path: string; message: string }[];
  /** The crawl stopped at the limit: some pages were not read. */
  truncated: boolean;
  limit: number;
}

const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|mp4|webm|mp3|woff2?|ttf)$/i;

const key = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = '';
    x.search = '';
    const s = x.toString();
    return s.length > x.origin.length + 1 ? s.replace(/\/$/, '') : s;
  } catch {
    return u;
  }
};

export async function auditSite(
  start: string,
  opts: FetchOptions & { limit?: number; seeds?: string[]; site?: SiteFiles | null; concurrency?: number; onProgress?: (done: number, queued: number) => void } = {},
): Promise<SiteAudit> {
  const origin = new URL(start).origin;
  const limit = opts.limit ?? 80;
  const sitemap = new Set((opts.site?.sitemap?.urls ?? []).map(key));
  const queue: string[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const push = (u: string) => {
    let url: URL;
    try {
      url = new URL(u, origin);
    } catch {
      return;
    }
    if (url.origin !== origin || ASSET.test(url.pathname)) return;
    const k = key(url.toString());
    if (seen.has(k)) return;
    if (seen.size >= limit) {
      truncated = true;
      return;
    }
    seen.add(k);
    queue.push(k);
  };
  push(start);
  for (const s of opts.seeds ?? []) push(s);
  for (const s of opts.site?.sitemap?.urls ?? []) push(s);

  const metas = new Map<string, PageMeta | null>();
  const sources = new Map<string, Set<string>>();
  const anchors: { url: string; from: string }[] = [];
  let done = 0;
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let meta: PageMeta | null = null;
      try {
        meta = await readPageMeta(url, { ...opts, bot: 'google' });
      } catch {
        meta = null;
      }
      metas.set(url, meta);
      done++;
      opts.onProgress?.(done, seen.size);
      if (!meta || !(meta.contentType ?? '').includes('html')) continue;
      const from = new URL(url).pathname;
      for (const l of meta.links) {
        const k = key(l);
        if (!sources.has(k)) sources.set(k, new Set());
        sources.get(k)!.add(from);
        push(l);
      }
      for (const h of meta.hashLinks) anchors.push({ url: h, from });
    }
  };
  while (queue.length) await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));

  const pages: AuditPage[] = [];
  for (const [url, meta] of metas) {
    const path = new URL(url).pathname;
    const html = !!meta && (meta.contentType ?? '').includes('html');
    const noindex = !!meta && /noindex/i.test(`${meta.robotsMeta ?? ''} ${meta.robotsHeader ?? ''}`);
    if (!meta || !html) {
      pages.push({ url, path, status: meta?.status ?? null, title: null, description: null, score: null, errors: meta && meta.status < 400 ? 0 : 1, warnings: 0, problems: [], noindex, inSitemap: sitemap.has(url) });
      continue;
    }
    // Site files are the same for every page: only their checks on the first page matter.
    const checks = runChecks({ meta, image: null, site: null }).filter((c) => c.status !== 'skip' && !['robots', 'sitemap', 'favicon', 'manifest', 'og-image-format'].includes(c.id));
    const bad = checks.filter((c) => c.status === 'error' || c.status === 'warning');
    pages.push({
      url,
      path,
      status: meta.status,
      title: meta.title,
      description: meta.description,
      score: score(checks),
      errors: bad.filter((c) => c.status === 'error').length,
      warnings: bad.filter((c) => c.status === 'warning').length,
      problems: bad.map(({ id, label, status, detail }) => ({ id, label, status, detail })),
      noindex,
      inSitemap: sitemap.has(url),
    });
  }
  pages.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.path.localeCompare(b.path));

  // Broken links: targets read during the crawl that answered an error.
  const brokenLinks: BrokenLink[] = [];
  for (const [target, from] of sources) {
    if (!metas.has(target)) continue;
    const m = metas.get(target);
    if (m && m.status < 400) continue;
    brokenLinks.push({ url: target, path: new URL(target).pathname, kind: 'page', status: m?.status ?? null, from: [...from].sort() });
  }
  // Dead anchors: the target page was read and has no element with that id (raw HTML).
  const deadAnchors = new Map<string, Set<string>>();
  for (const a of anchors) {
    const u = new URL(a.url);
    const frag = decodeURIComponent(u.hash.slice(1));
    if (!frag || frag === 'top') continue;
    const m = metas.get(key(a.url));
    if (!m || m.status >= 400 || m.ids.includes(frag)) continue;
    if (!deadAnchors.has(a.url)) deadAnchors.set(a.url, new Set());
    deadAnchors.get(a.url)!.add(a.from);
  }
  for (const [url, from] of deadAnchors) brokenLinks.push({ url, path: new URL(url).pathname + new URL(url).hash, kind: 'anchor', status: null, from: [...from].sort() });

  const dupes = (pick: (p: AuditPage) => string | null): Duplicate[] => {
    const by = new Map<string, string[]>();
    for (const p of pages) {
      const v = pick(p);
      if (!v || p.noindex || (p.status ?? 500) >= 400) continue;
      by.set(v, [...(by.get(v) ?? []), p.path]);
    }
    return [...by].filter(([, paths]) => paths.length > 1).map(([value, paths]) => ({ value, paths: paths.sort() }));
  };

  const ok = (p: AuditPage) => p.status !== null && p.status < 300 && p.score !== null && !p.noindex;
  const notInSitemap = sitemap.size ? pages.filter((p) => ok(p) && !p.inSitemap).map((p) => p.path).sort() : [];
  const sitemapBroken = [...sitemap].filter((u) => metas.has(u) && (metas.get(u)?.status ?? 500) >= 400).map((u) => ({ url: u, status: metas.get(u)?.status ?? null }));

  // hreflang across pages: an alternate that was read must list the page back.
  const hreflang: { path: string; message: string }[] = [];
  for (const [url, m] of metas) {
    if (!m?.hreflang.length) continue;
    for (const h of m.hreflang) {
      const k = key(h.href);
      if (k === url || !metas.has(k)) continue;
      const other = metas.get(k);
      if (!other) continue;
      if (!other.hreflang.some((x) => key(x.href) === url))
        hreflang.push({ path: new URL(url).pathname, message: t(`${h.lang} (${new URL(k).pathname}) does not link back.`, `${h.lang} (${new URL(k).pathname}) ne renvoie pas vers elle.`) });
    }
  }

  return {
    origin,
    at: Date.now(),
    pages,
    brokenLinks: brokenLinks.sort((a, b) => b.from.length - a.from.length),
    duplicateTitles: dupes((p) => p.title),
    duplicateDescriptions: dupes((p) => p.description),
    notInSitemap,
    sitemapBroken,
    hreflang,
    truncated,
    limit,
  };
}

/** Problems of the audit, for Claude: one line each. */
export function auditPrompt(a: SiteAudit): string {
  const lines: string[] = [];
  for (const b of a.brokenLinks) lines.push(b.kind === 'page' ? `- Broken link → ${b.path} (${b.status ? `HTTP ${b.status}` : 'unreachable'}), linked from ${b.from.slice(0, 5).join(', ')}` : `- Dead anchor ${b.path} (no element with this id in the HTML), linked from ${b.from.slice(0, 5).join(', ')}`);
  for (const d of a.duplicateTitles) lines.push(`- Same <title> “${d.value}” on ${d.paths.join(', ')}`);
  for (const d of a.duplicateDescriptions) lines.push(`- Same meta description on ${d.paths.join(', ')}`);
  if (a.notInSitemap.length) lines.push(`- Missing from the sitemap: ${a.notInSitemap.join(', ')}`);
  for (const s of a.sitemapBroken) lines.push(`- Sitemap lists ${s.url}, which answers ${s.status ? `HTTP ${s.status}` : 'nothing'}`);
  for (const h of a.hreflang) lines.push(`- hreflang on ${h.path}: ${h.message}`);
  for (const p of a.pages.filter((x) => x.errors || x.warnings).slice(0, 30)) lines.push(`- ${p.path}: ${p.problems.map((x) => `${x.label} (${x.detail})`).join('; ')}`);
  return lines.join('\n');
}
