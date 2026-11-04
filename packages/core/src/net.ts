import { t } from './i18n.ts';

/**
 * fetch() whose network errors say why. Node's "fetch failed" hides the real cause
 * (redirect loop, DNS, TLS, refused connection…) in `error.cause`.
 */
export async function fetchExplained(f: typeof fetch, url: string | URL, init?: RequestInit): Promise<Response> {
  try {
    return await f(url, init);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(t(`timed out for ${String(url)}`, `délai dépassé pour ${String(url)}`));
    const cause = err.cause?.message ?? err.cause?.code;
    throw new Error(cause && cause !== err.message ? t(`${err.message}: ${cause}`, `${err.message} : ${cause}`) : err.message);
  }
}
