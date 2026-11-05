import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { locale, t } from '@kinglet/core';
import type { ExportShot } from '../../shared/types';
import { api } from '../store';

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });

/** Canvas limits: Chromium refuses canvases over 16 384 px on a side. */
const MAX_SIDE = 16_000;

/**
 * Every device side by side on one sheet, under the page address and the date, each at its true
 * CSS size relative to the others. Light background: it is meant to be sent to a client.
 */
export async function composeSheet(shots: ExportShot[], title: string): Promise<Uint8Array> {
  const imgs = await Promise.all(shots.map((s) => load(s.dataUrl)));
  const gap = 48;
  const pad = 56;
  const head = 84;
  const label = 34;
  const totalW = shots.reduce((a, s) => a + s.width, 0) + gap * (shots.length - 1) + pad * 2;
  const maxH = Math.max(...shots.map((s) => s.height)) + head + label + pad * 2;
  // Two device pixels per CSS px when it fits.
  const px = Math.max(0.25, Math.min(2, MAX_SIDE / totalW, MAX_SIDE / maxH));
  const c = document.createElement('canvas');
  c.width = Math.round(totalW * px);
  c.height = Math.round(maxH * px);
  const g = c.getContext('2d')!;
  g.scale(px, px);
  g.fillStyle = '#f4f4f5';
  g.fillRect(0, 0, totalW, maxH);
  g.fillStyle = '#18181b';
  g.font = '600 22px system-ui, sans-serif';
  g.fillText(title, pad, pad + 16);
  g.fillStyle = '#71717a';
  g.font = '15px system-ui, sans-serif';
  g.fillText(new Date().toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' }), pad, pad + 44);
  let x = pad;
  shots.forEach((s, i) => {
    const y = pad + head;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.12)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 8;
    g.fillStyle = '#fff';
    g.fillRect(x, y, s.width, s.height);
    g.restore();
    g.drawImage(imgs[i]!, x, y, s.width, s.height);
    g.strokeStyle = '#e4e4e7';
    g.strokeRect(x + 0.5, y + 0.5, s.width - 1, s.height - 1);
    g.fillStyle = '#3f3f46';
    g.font = '500 14px system-ui, sans-serif';
    g.fillText(`${s.label} · ${s.width} × ${s.height}${s.cut ? ` · ${t('cut', 'coupée')}` : ''}`, x, y + s.height + 24);
    x += s.width + gap;
  });
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The devices scrolling from top to bottom together, recorded as a WebM video or a GIF.
 * Frames are what the views show (nothing is re-rendered), so the devices must be visible.
 */
export async function recordScroll(format: 'webm' | 'gif', onProgress: (ratio: number) => void, opts: { seconds?: number; fps?: number } = {}): Promise<Uint8Array> {
  const fps = opts.fps ?? (format === 'gif' ? 10 : 15);
  const n = Math.round((opts.seconds ?? 6) * fps);
  api().export.scroll(0);
  await sleep(500);
  const first = await api().export.frames();
  const ids = Object.keys(first);
  if (!ids.length) throw new Error(t('No device to record.', 'Aucun appareil à enregistrer.'));
  const sizes = (await Promise.all(ids.map((id) => load(first[id]!)))).map((img) => img.naturalWidth / img.naturalHeight);
  const H = format === 'gif' ? 480 : 720;
  const gap = Math.round(H / 18);
  const widths = sizes.map((r) => Math.round(H * r));
  const W = widths.reduce((a, b) => a + b, 0) + gap * (ids.length + 1);
  const c = document.createElement('canvas');
  // Even sizes: video encoders want them.
  c.width = W + (W % 2);
  c.height = H + gap * 2 + ((H + gap * 2) % 2);
  const g = c.getContext('2d', { willReadFrequently: format === 'gif' })!;
  const draw = async (frames: Record<string, string>) => {
    g.fillStyle = '#0f0f11';
    g.fillRect(0, 0, c.width, c.height);
    let x = gap;
    for (const [i, id] of ids.entries()) {
      const src = frames[id];
      if (src) g.drawImage(await load(src), x, gap, widths[i]!, H);
      x += widths[i]! + gap;
    }
  };

  const gif = format === 'gif' ? GIFEncoder() : null;
  const stream = format === 'webm' ? c.captureStream(0) : null;
  const track = stream?.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
  const chunks: Blob[] = [];
  const rec = stream ? new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 6_000_000 }) : null;
  if (rec) {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
  }
  const frameMs = 1000 / fps;
  for (let i = 0; i <= n; i++) {
    const started = performance.now();
    api().export.scroll(i / n);
    await sleep(Math.max(30, frameMs * 0.4)); // let the devices paint the new position
    await draw(await api().export.frames());
    if (gif) {
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), c.width, c.height, { palette, delay: Math.round(frameMs) });
    } else track?.requestFrame?.();
    onProgress(i / n);
    await sleep(Math.max(0, frameMs - (performance.now() - started)));
  }
  api().export.scroll(0);
  if (gif) {
    gif.finish();
    return gif.bytes();
  }
  await new Promise<void>((res) => {
    rec!.onstop = () => res();
    rec!.stop();
  });
  return new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
}
