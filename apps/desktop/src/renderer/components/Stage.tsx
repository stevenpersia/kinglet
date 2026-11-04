import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { locale, t } from '@parakeet/core';
import type { DevicePreset, Throttle } from '../../shared/types';
import { BEZEL, fitScale, viewportOf } from '../lib/layout';
import { activePresets, api, devicePresets, useStore } from '../store';
import { setActiveIds } from '../../shared/devices';
import { ConsoleTab } from './Console';
import { OldProdBanner } from './EnvSwitch';
import { Icon } from './Icons';
import { Welcome } from './Welcome';
import type { Viewport } from '../lib/layout';

const groups = (): { kind: DevicePreset['kind']; label: string }[] => [
  { kind: 'phone', label: t('Phones', 'Téléphones') },
  { kind: 'tablet', label: t('Tablets', 'Tablettes') },
  { kind: 'desktop', label: t('Screens', 'Écrans') },
];

function DeviceToolbar({ scale }: { scale: number }) {
  const state = useStore();
  const { settings, updateSettings } = state;
  const presets = devicePresets(state);
  const active = activePresets(state).map((p) => p.id);
  const toggle = (id: string) => {
    const on = active.includes(id);
    if (on && active.length === 1) return;
    const next = on ? active.filter((x) => x !== id) : [...active, id];
    // Keep the order chosen in the settings.
    void updateSettings(setActiveIds(state.presets, settings, next));
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
              const on = active.includes(p.id);
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
        <MediaMenu />
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

/** Dark mode, reduced motion, high contrast on every device (CSS media features). */
function MediaMenu() {
  const { settings, updateSettings, openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  const m = settings.media;
  const on = m.colorScheme !== 'auto' || m.reducedMotion || m.moreContrast;
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const set = (patch: Partial<typeof m>) => void updateSettings({ media: { ...m, ...patch } });
  const row = (active: boolean) => `flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs ${active ? 'bg-active text-fg' : 'text-muted hover:bg-active/60 hover:text-fg'}`;
  const label = [m.colorScheme === 'dark' ? t('Dark', 'Sombre') : m.colorScheme === 'light' ? t('Light', 'Clair') : null, m.reducedMotion ? t('No motion', 'Sans animation') : null, m.moreContrast ? t('Contrast', 'Contraste') : null].filter(Boolean).join(' · ');
  return (
    <div className="relative">
      <button
        aria-pressed={on}
        aria-expanded={open}
        onClick={toggle}
        title={t('Dark mode, reduced motion, high contrast', 'Mode sombre, animations réduites, contraste élevé')}
        className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? 'border-[#3a3f5c] bg-[rgba(138,180,248,0.08)] font-medium text-local' : 'border-line text-muted hover:border-line-strong'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></svg>
        {on ? label : t('Appearance', 'Apparence')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-8 right-0 z-50 w-72 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <div className="label px-2.5 pt-2 pb-1.5">{t('Theme', 'Thème')}</div>
            {(
              [
                ['auto', t('Site default', 'Celui du site'), t('no preference', 'pas de préférence')],
                ['light', t('Light', 'Clair'), 'prefers-color-scheme: light'],
                ['dark', t('Dark', 'Sombre'), 'prefers-color-scheme: dark'],
              ] as const
            ).map(([id, text, hint]) => (
              <button key={id} role="menuitemradio" aria-checked={m.colorScheme === id} onClick={() => set({ colorScheme: id })} className={row(m.colorScheme === id)}>
                {text}
                <span className="font-mono text-[10.5px] text-ghost">{hint}</span>
              </button>
            ))}
            <div className="label px-2.5 pt-3 pb-1.5">{t('Accessibility', 'Accessibilité')}</div>
            <button role="menuitemcheckbox" aria-checked={m.reducedMotion} onClick={() => set({ reducedMotion: !m.reducedMotion })} className={row(m.reducedMotion)}>
              {t('Reduced motion', 'Animations réduites')}
              <span className="font-mono text-[10.5px] text-ghost">{m.reducedMotion ? '✓' : ''} reduce</span>
            </button>
            <button role="menuitemcheckbox" aria-checked={m.moreContrast} onClick={() => set({ moreContrast: !m.moreContrast })} className={row(m.moreContrast)}>
              {t('High contrast', 'Contraste élevé')}
              <span className="font-mono text-[10.5px] text-ghost">{m.moreContrast ? '✓' : ''} more</span>
            </button>
            <p className="m-0 px-2.5 pt-2.5 pb-2 text-[11.5px] leading-normal text-faint">
              {t('What the page sees in its CSS media queries, on every device. Applies right away, no reload.', 'Ce que la page voit dans ses media queries CSS, sur tous les appareils. Immédiat, sans recharger.')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

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

/** The capture with a numbered pin where the user pointed (fx, fy: 0..1), as a JPEG. */
async function pinned(src: string, fx: number, fy: number, n: number): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, 900 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const r = Math.max(12, c.width / 30);
  const x = fx * c.width;
  const y = fy * c.height;
  g.fillStyle = 'rgba(217,119,87,0.3)';
  g.beginPath();
  g.arc(x, y, r * 1.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d97757';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `600 ${Math.round(r * 1.1)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), x, y + 1);
  return c.toDataURL('image/jpeg', 0.85);
}

/** "Show Claude": the click on a device becomes a capture with a pin, and the element under it. */
async function pointAt(preset: DevicePreset, viewport: Viewport, el: HTMLElement, e: React.MouseEvent) {
  const s = useStore.getState();
  const r = el.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  const x = Math.round(fx * viewport.width);
  const y = Math.round(fy * viewport.height);
  // What the device showed when pointing started (a DevTools capture would wait for the hidden view).
  const shot = s.frozen?.[preset.id];
  const id = s.settings.activeId;
  const n = (id ? (s.drafts[id]?.attachments.filter((a) => a.kind === 'image').length ?? 0) : 0) + 1;
  const [info, image] = await Promise.all([api().elementAt(preset.id, x, y), shot ? pinned(shot, fx, fy, n).catch(() => null) : Promise.resolve(null)]);
  s.stopPointing();
  const where = `${preset.label} (${viewport.width}×${viewport.height})`;
  s.askClaude('', [
    ...(image ? [{ kind: 'image' as const, label: t(`${preset.label} · pin ${n}`, `${preset.label} · épingle ${n}`), dataUrl: image }] : []),
    {
      kind: 'context' as const,
      label: t(`pointed-element-${n}`, `element-montre-${n}`),
      text: [
        `Pin ${n} on ${where}, at x=${x}, y=${y} CSS px (page ${s.url ?? ''}).`,
        info ? `Element: ${info.selector} <${info.tag}>, box ${Math.round(info.rect.x)},${Math.round(info.rect.y)} ${Math.round(info.rect.width)}×${Math.round(info.rect.height)}` : 'Element: unknown',
        info?.text ? `Text: ${info.text}` : '',
        info?.html ? `HTML: ${info.html}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]);
}

function PointingBar() {
  const stopPointing = useStore((s) => s.stopPointing);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stopPointing();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stopPointing]);
  return (
    <div role="status" className="absolute top-3 right-4 left-4 z-20 flex items-center gap-2.5 rounded-lg border border-[rgba(217,119,87,0.35)] bg-[#1c1513] shadow-xl shadow-black/50 px-3 py-2 text-[12.5px] text-muted">
      <Icon name="target" size={13} className="text-[#d97757]" />
      <span className="flex-1">{t('Click a spot on a device to show it to Claude.', 'Clique un endroit d’un appareil pour le montrer à Claude.')}</span>
      <button onClick={stopPointing} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-fg hover:border-line-strong">
        {t('Cancel (Esc)', 'Annuler (Échap)')}
      </button>
    </div>
  );
}

export function Stage() {
  const state = useStore();
  if (!state.url && state.status === 'idle') return <Welcome />;
  return <Devices />;
}

function Devices() {
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
    <main className="stage-bg relative flex min-w-0 flex-1 flex-col">
      <OldProdBanner />
      {state.pointing && <PointingBar />}
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
                  className={`overflow-hidden bg-card ${state.pointing ? 'cursor-crosshair ring-2 ring-[#d97757]/60' : ''}`}
                  style={{ width: w, height: h, borderRadius: radius }}
                  onClick={state.pointing ? (e) => void pointAt(preset, viewport, e.currentTarget, e) : undefined}
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
                      state.toggleConsole(true);
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
      {state.consoleOpen && <ConsoleDrawer />}
    </main>
  );
}

/** Live console of the devices, under them (opened from the left bar). */
function ConsoleDrawer() {
  const toggleConsole = useStore((s) => s.toggleConsole);
  return (
    <section aria-label={t('Console drawer', 'Tiroir de console')} className="relative flex h-[280px] shrink-0 flex-col border-t border-line-soft bg-chrome">
      <button onClick={() => toggleConsole(false)} aria-label={t('Close the console', 'Fermer la console')} title={t('Close', 'Fermer')} className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
        <Icon name="close" size={11} />
      </button>
      <div className="min-h-0 flex-1 p-4 pr-10">
        <ConsoleTab />
      </div>
    </section>
  );
}
