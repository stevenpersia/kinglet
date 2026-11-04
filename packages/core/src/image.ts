import { fetchExplained } from './net.ts';
import { imageSize } from 'image-size';
import { BOTS, type BotId } from './bots.ts';

export interface ImageProbe {
  url: string;
  ok: boolean;
  status: number | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  type: string | null;
  error: string | null;
}

export async function probeImage(
  url: string,
  opts: { bot?: BotId; headers?: Record<string, string>; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ImageProbe> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchExplained(f, url, {
      redirect: 'follow',
      headers: { 'user-agent': BOTS[opts.bot ?? 'whatsapp'], ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      return { url, ok: false, status: res.status, bytes: null, width: null, height: null, type: null, error: `HTTP ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const dim = imageSize(buf);
    return {
      url,
      ok: true,
      status: res.status,
      bytes: buf.byteLength,
      width: dim.width ?? null,
      height: dim.height ?? null,
      type: dim.type ?? null,
      error: null,
    };
  } catch (e) {
    return { url, ok: false, status: null, bytes: null, width: null, height: null, type: null, error: (e as Error).message };
  }
}
