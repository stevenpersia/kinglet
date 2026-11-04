import { useLayoutEffect, useRef, useState } from 'react';
import { locale, t } from '@parakeet/core';
import type { DevicePreset, Throttle } from '../../shared/types';
import { BEZEL, fitScale, viewportOf } from '../lib/layout';
import { activePresets, api, useStore } from '../store';
import { Icon } from './Icons';

const groups = (): { kind: DevicePreset['kind']; label: string }[] => [
  { kind: 'phone', label: t('Phones', 'Téléphones') },
  { kind: 'tablet', label: t('Tablets', 'Tablettes') },
  { kind: 'desktop', label: t('Screens', 'Écrans') },
];

function DeviceToolbar({ scale }: { scale: number }) {
  const { presets, settings, updateSettings } = useStore();
  const toggle = (id: string) => {
    const on = settings.active.includes(id);
    if (on && settings.active.length === 1) return;
    const next = on ? settings.active.filter((x) => x !== id) : [...settings.active, id];
    // Keep the presets' order: phones, then tablets, then screens.
    void updateSettings({ active: presets.filter((p) => next.includes(p.id)).map((p) => p.id) });
  };
  const chip = (on: boolean) =>
    `inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? 'border-line-strong bg-active font-medium text-fg' : 'border-line text-muted hover:border-line-strong'}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {groups().map((g) => (
        <div key={g.kind} role="group" aria-label={g.label} className="flex flex-wrap items-center gap-1.5">
          {presets
            .filter((p) => p.kind === g.kind)
            .map((p) => {
              const on = settings.active.includes(p.id);
              return (
                <button key={p.id} aria-pressed={on} onClick={() => toggle(p.id)} className={chip(on)}>
                  {p.label}
                  <span className="font-mono text-[10.5px] text-ghost">{p.width}</span>
                </button>
              );
            })}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <ThrottleMenu />
        <button aria-pressed={settings.landscape} onClick={() => void updateSettings({ landscape: !settings.landscape })} title={t('Landscape (Ctrl+Shift+O)', 'Paysage (Ctrl+Maj+O)')} className={chip(settings.landscape)}>
          <Icon name="rotate" size={13} />
          {t('Landscape', 'Paysage')}
        </button>
        <button aria-pressed={settings.scrollSync} onClick={() => void updateSettings({ scrollSync: !settings.scrollSync })} title={t('Sync scrolling and navigation (Ctrl+Shift+S)', 'Synchroniser scroll et navigation (Ctrl+Maj+S)')} className={chip(settings.scrollSync)}>
          <span aria-hidden="true" className={`size-1.5 rounded-full ${settings.scrollSync ? 'bg-ok' : 'bg-ghost'}`} />
          {t('Sync', 'Synchro')}
        </button>
        <span className="inline-flex h-[26px] items-center rounded-md border border-line px-2.5 font-mono text-xs text-muted">{Math.round(scale * 100)}{t('%', ' %')}</span>
      </div>
    </div>
  );
}

const NETWORK: { id: Throttle['network']; label: () => string; hint: () => string }[] = [
  { id: 'off', label: () => t('Fast', 'Rapide'), hint: () => t('Your connection', 'Ta connexion') },
  { id: '4g', label: () => t('Slow 4G', '4G lente'), hint: () => t('1.6 Mb/s · 150 ms', '1,6 Mb/s · 150 ms') },
  { id: '3g', label: () => t('Slow 3G', '3G lente'), hint: () => '400 kb/s · 2 s' },
];
const CPU: { id: Throttle['cpu']; label: () => string; hint: () => string }[] = [
  { id: 1, label: () => t('Full speed', 'Pleine vitesse'), hint: () => t('Your computer', 'Ton ordinateur') },
  { id: 4, label: () => t('Mid-range phone', 'Téléphone moyen'), hint: () => 'CPU ×4' },
  { id: 6, label: () => t('Low-end phone', 'Téléphone d’entrée de gamme'), hint: () => 'CPU ×6' },
];

/** Slow network and CPU for phones and tablets: a site is much slower there than on a PC. */
function ThrottleMenu() {
  const { settings, updateSettings, openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  const th = settings.throttle;
  const on = th.network !== 'off' || th.cpu > 1;
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const set = (patch: Partial<Throttle>) => void updateSettings({ throttle: { ...th, ...patch } });
  const row = (active: boolean) => `flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs ${active ? 'bg-active text-fg' : 'text-muted hover:bg-active/60 hover:text-fg'}`;
  return (
    <div className="relative">
      <button
        aria-pressed={on}
        aria-expanded={open}
        onClick={toggle}
        title={t('Slow network and CPU (phones and tablets)', 'Réseau et CPU ralentis (téléphones et tablettes)')}
        className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? 'border-[#5c4a26] bg-[rgba(230,192,123,0.08)] font-medium text-warn' : 'border-line text-muted hover:border-line-strong'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20a8 8 0 1 1 8-8M12 12l4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
        {on ? [th.network !== 'off' ? NETWORK.find((n) => n.id === th.network)!.label() : null, th.cpu > 1 ? `CPU ×${th.cpu}` : null].filter(Boolean).join(' · ') : t('Full speed', 'Pleine vitesse')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-8 right-0 z-50 w-72 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <div className="label px-2.5 pt-2 pb-1.5">{t('Network', 'Réseau')}</div>
            {NETWORK.map((n) => (
              <button key={n.id} role="menuitemradio" aria-checked={th.network === n.id} onClick={() => set({ network: n.id })} className={row(th.network === n.id)}>
                {n.label()}
                <span className="font-mono text-[10.5px] text-ghost">{n.hint()}</span>
              </button>
            ))}
            <div className="label px-2.5 pt-3 pb-1.5">CPU</div>
            {CPU.map((c) => (
              <button key={c.id} role="menuitemradio" aria-checked={th.cpu === c.id} onClick={() => set({ cpu: c.id })} className={row(th.cpu === c.id)}>
                {c.label()}
                <span className="font-mono text-[10.5px] text-ghost">{c.hint()}</span>
              </button>
            ))}
            <p className="m-0 px-2.5 pt-2.5 pb-2 text-[11.5px] leading-normal text-faint">
              {t('Applies to phones and tablets; screens stay at full speed. Reload to see the page load again.', 'S’applique aux téléphones et tablettes ; les écrans restent à pleine vitesse. Recharge pour revoir le chargement.')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`);
const weight = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} ${t('KB', 'Ko')}` : `${(b / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t('MB', 'Mo')}`);

export function Stage() {
  const state = useStore();
  const { settings, frozen, perf, logs } = state;
  const devices = activePresets(state);
  const errorsOf = (id: string) => logs.filter((l) => l.deviceId === id && l.level === 'error').length;
  const throttled = (p: DevicePreset) => p.kind !== 'desktop' && (settings.throttle.network !== 'off' || settings.throttle.cpu > 1);
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setSize({
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = devices.map((p) => ({ preset: p, kind: p.kind, viewport: viewportOf(p, settings.landscape) }));
  const scale = size.w > 0 ? fitScale(items, size.w, size.h) : 0.5;

  // After every render: tell the main process where each native view goes.
  useLayoutEffect(() => {
    if (!size.w) return;
    const slots = items.flatMap(({ preset, viewport }) => {
      const el = slotRefs.current.get(preset.id);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ id: preset.id, x: r.left, y: r.top, width: r.width, height: r.height, scale: r.width / viewport.width }];
    });
    api().setLayout(slots);
  });

  return (
    <main className="stage-bg flex min-w-0 flex-1 flex-col">
      <DeviceToolbar scale={scale} />
      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center gap-11 overflow-hidden px-6 pt-2 pb-6">
        {items.map(({ preset, viewport }) => {
          const w = Math.round(viewport.width * scale);
          const h = Math.round(viewport.height * scale);
          const radius = Math.round(preset.radius * scale);
          const pad = BEZEL[preset.kind];
          return (
            <div key={preset.id} className="flex flex-col items-center gap-2.5">
              <div className="bg-black shadow-[0_0_0_1px_#2e2e33,0_30px_60px_rgba(0,0,0,0.65)]" style={{ padding: pad, borderRadius: preset.kind === 'desktop' ? 8 : radius + pad }}>
                <div
                  ref={(el) => {
                    if (el) slotRefs.current.set(preset.id, el);
                    else slotRefs.current.delete(preset.id);
                  }}
                  className="overflow-hidden bg-card"
                  style={{ width: w, height: h, borderRadius: radius }}
                >
                  {frozen?.[preset.id] && <img src={frozen[preset.id]} alt="" className="block size-full object-cover object-top" />}
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
                <span>
                  {preset.label} · {viewport.width} × {viewport.height}
                </span>
                {perf[preset.id] && (
                  <span
                    title={t(`Loaded in ${seconds(perf[preset.id]!.loadMs)} (DOM ready ${seconds(perf[preset.id]!.domMs)}), ${perf[preset.id]!.requests} requests`, `Chargée en ${seconds(perf[preset.id]!.loadMs)} (DOM prêt ${seconds(perf[preset.id]!.domMs)}), ${perf[preset.id]!.requests} requêtes`)}
                    className={throttled(preset) ? 'text-warn' : ''}
                  >
                    · {seconds(perf[preset.id]!.loadMs)} · {weight(perf[preset.id]!.bytes)}
                  </span>
                )}
                {errorsOf(preset.id) > 0 && (
                  <button
                    onClick={() => {
                      useStore.setState({ consoleDevice: preset.id });
                      state.setInspectorTab('console');
                    }}
                    title={t('See the console of this device', 'Voir la console de cet appareil')}
                    className="flex items-center gap-1 rounded bg-[rgba(242,139,130,0.12)] px-1.5 py-px font-mono text-[10.5px] text-err hover:bg-[rgba(242,139,130,0.2)]"
                  >
                    {errorsOf(preset.id)} {errorsOf(preset.id) > 1 ? t('errors', 'erreurs') : t('error', 'erreur')}
                  </button>
                )}
                <button onClick={() => api().openDevtools(preset.id)} title={t('Open this device’s DevTools', 'Ouvrir les DevTools de cet appareil')} aria-label={`DevTools ${preset.label}`} className="rounded p-0.5 text-ghost hover:bg-active hover:text-fg">
                  <Icon name="code" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
