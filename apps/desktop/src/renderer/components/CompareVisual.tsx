import { locale, t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { EnvId, VisualColumn } from '../../shared/types';
import { ENV_DOT } from '../lib/env';
import { activePresets, api, useStore } from '../store';
import { Dot, Icon } from './Icons';

/** Pixels that differ between two captures, painted red over a dimmed copy of `b`. */
async function diff(a: string, b: string): Promise<{ image: string; ratio: number }> {
  const load = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = Math.min(ia.width, ib.width);
  const h = Math.min(ia.height, ib.height);
  const pixels = (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, w, h);
  };
  const pa = pixels(ia).data;
  const out = pixels(ib);
  const d = out.data;
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    const delta = Math.abs(pa[i]! - d[i]!) + Math.abs(pa[i + 1]! - d[i + 1]!) + Math.abs(pa[i + 2]! - d[i + 2]!);
    if (delta > 48) {
      changed++;
      d[i] = 242;
      d[i + 1] = 80;
      d[i + 2] = 70;
      d[i + 3] = 255;
    } else {
      // Dimmed, to make the red stand out.
      const grey = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      d[i] = d[i + 1] = d[i + 2] = Math.round(grey * 0.35 + 10);
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return { image: c.toDataURL('image/png'), ratio: changed / (w * h) };
}

const ms = (v: number | null | undefined) => (v == null ? '—' : v < 1000 ? `${v} ms` : `${(v / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`);

/** The page on each environment, as one device shows it, with the differences in red. */
export function CompareVisual({ targets }: { targets: { env: EnvId; label: string; url: string }[] }) {
  const s = useStore();
  const devices = activePresets(s);
  const [device, setDevice] = useState(devices[0]?.id ?? '');
  const [cols, setCols] = useState<VisualColumn[] | null>(null);
  const [diffs, setDiffs] = useState<Record<string, { image: string; ratio: number }>>({});
  const [showDiff, setShowDiff] = useState(true);
  const [loading, setLoading] = useState(false);
  const key = targets.map((x) => x.url).join('|');

  const run = async () => {
    if (!device || targets.length < 2) return;
    setLoading(true);
    setDiffs({});
    const res = await api().compareVisual(targets, device);
    setCols(res);
    setLoading(false);
    const ref = res[0];
    if (!ref?.image) return;
    const out: Record<string, { image: string; ratio: number }> = {};
    for (const c of res.slice(1)) if (c.image) out[c.env] = await diff(ref.image, c.image);
    setDiffs(out);
  };
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, device]);

  const preset = devices.find((d) => d.id === device);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {devices.map((d) => (
          <button key={d.id} aria-pressed={d.id === device} onClick={() => setDevice(d.id)} className={`inline-flex h-[26px] items-center rounded-md border px-2.5 text-xs ${d.id === device ? 'border-line-strong bg-active font-medium text-fg' : 'border-line text-muted hover:border-line-strong'}`}>
            {d.label}
          </button>
        ))}
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showDiff} onChange={() => setShowDiff(!showDiff)} className="accent-[#ededef]" />
          {t(`Differences with ${targets[0]?.label ?? ''} in red`, `Différences avec ${targets[0]?.label ?? ''} en rouge`)}
        </label>
        <button onClick={() => void run()} disabled={loading} className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong disabled:opacity-60">
          <Icon name="reload" size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? t('Rendering…', 'Rendu…') : t('Render again', 'Refaire le rendu')}
        </button>
      </div>
      {loading && !cols && <p className="m-0 text-faint">{t(`Rendering each environment on ${preset?.label ?? ''}…`, `Rendu de chaque environnement sur ${preset?.label ?? ''}…`)}</p>}
      {cols && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {cols.map((c, i) => {
            const d = diffs[c.env];
            const lcp = c.vitals?.lcpMs;
            const cls = c.vitals?.cls;
            return (
              <figure key={c.env} aria-label={c.label} className="m-0 flex w-[280px] shrink-0 flex-col gap-2">
                <figcaption className="flex items-center gap-2 text-[13px] font-semibold">
                  <Dot className={ENV_DOT[c.env]} />
                  <span className="min-w-0 truncate" title={c.label}>
                    {c.label}
                  </span>
                  {i > 0 && d && <span className={`ml-auto shrink-0 font-mono text-xs font-normal ${d.ratio > 0.005 ? 'text-warn' : 'text-ok'}`}>{d.ratio > 0.0005 ? `${(d.ratio * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })} %` : t('identical', 'identique')}</span>}
                </figcaption>
                {c.image ? (
                  <img src={i > 0 && showDiff && d ? d.image : c.image} alt={t(`${c.label} on ${preset?.label ?? ''}`, `${c.label} sur ${preset?.label ?? ''}`)} className="block w-full rounded-md border border-line" />
                ) : (
                  <p className="m-0 rounded-md border border-line p-3 text-xs text-err">{c.error ?? t('No capture', 'Pas de capture')}</p>
                )}
                <span className="flex gap-3 font-mono text-[11px] text-muted">
                  <span className={lcp != null && lcp > 2500 ? 'text-warn' : ''}>LCP {ms(lcp)}</span>
                  <span className={cls != null && cls > 0.1 ? 'text-warn' : ''}>CLS {cls == null ? '—' : cls.toFixed(2)}</span>
                  <span>TTFB {ms(c.vitals?.ttfbMs)}</span>
                </span>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
