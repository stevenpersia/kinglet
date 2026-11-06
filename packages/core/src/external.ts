import { t } from './i18n.ts';

/**
 * Links to other sites: answered with an error (404, 410, 5xx, domain gone) they are broken.
 * Many sites turn bots away (401, 403, 429, LinkedIn's 999) or are slow: those are "not
 * verifiable", not broken, so they are listed apart.
 */

export interface ExternalLink {
  url: string;
  status: number | null;
  /** Why it could not be read (DNS, TLS, timeout…). */
  error: string | null;
  /** Pages of the site that contain the link (paths). */
  from: string[];
}

export interface ExternalReport {
  /** Distinct external URLs found. */
  found: number;
  checked: number;
  broken: ExternalLink[];
  unverified: ExternalLink[];
}

/** A regular browser: a bot user agent gets turned away by more sites. */
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Bot walls and rate limits: the page may well exist. */
const UNVERIFIABLE = new Set([401, 403, 406, 418, 429, 999]);

type Verdict = { kind: 'ok' | 'broken' | 'unverified'; status: number | null; error: string | null };

const describe = (e: unknown): { error: string; dead: boolean } => {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return { error: t('timed out', 'délai dépassé'), dead: false };
  const code = err.cause?.code ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { error: t('domain not found', 'domaine introuvable'), dead: code === 'ENOTFOUND' };
  if (code === 'ECONNREFUSED') return { error: t('connection refused', 'connexion refusée'), dead: true };
  if (/CERT|SSL|TLS/i.test(code)) return { error: t('invalid certificate', 'certificat invalide'), dead: true };
  return { error: err.cause?.message ?? err.message, dead: false };
};

async function probe(url: string, f: typeof fetch, timeoutMs: number): Promise<Verdict> {
  const once = async (method: 'HEAD' | 'GET') => {
    const res = await f(url, { method, redirect: 'follow', headers: { 'user-agent': BROWSER_UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'en,fr;q=0.8' }, signal: AbortSignal.timeout(timeoutMs) });
    // Don't download the page: the status is enough.
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  };
  let status: number;
  try {
    status = await once('HEAD');
    // Some servers answer HEAD badly (405, 404, 403…): ask again the normal way.
    if (status >= 400) status = await once('GET');
  } catch (e) {
    try {
      status = await once('GET');
    } catch (e2) {
      const d = describe(e2 ?? e);
      return { kind: d.dead ? 'broken' : 'unverified', status: null, error: d.error };
    }
  }
  if (status < 400) return { kind: 'ok', status, error: null };
  if (UNVERIFIABLE.has(status)) return { kind: 'unverified', status, error: null };
  return { kind: 'broken', status, error: null };
}

/** Checks each external URL once (a few at a time), whatever the number of pages that link to it. */
export async function checkExternalLinks(
  links: Map<string, Set<string>>,
  opts: { fetchImpl?: typeof fetch; limit?: number; concurrency?: number; timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ExternalReport> {
  const f = opts.fetchImpl ?? fetch;
  // The most linked first: if the limit cuts, it cuts the least important ones.
  const all = [...links].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  const queue = all.slice(0, opts.limit ?? 200);
  const broken: ExternalLink[] = [];
  const unverified: ExternalLink[] = [];
  let done = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [url, from] = item;
      const v = await probe(url, f, opts.timeoutMs ?? 8000);
      const link = { url, status: v.status, error: v.error, from: [...from].sort() };
      if (v.kind === 'broken') broken.push(link);
      else if (v.kind === 'unverified') unverified.push(link);
      opts.onProgress?.(++done, Math.min(all.length, opts.limit ?? 200));
    }
  };
  const checked = Math.min(all.length, opts.limit ?? 200);
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  const order = (a: ExternalLink, b: ExternalLink) => b.from.length - a.from.length || a.url.localeCompare(b.url);
  return { found: all.length, checked, broken: broken.sort(order), unverified: unverified.sort(order) };
}
