import { useLayoutEffect, useRef, useState } from 'react';
import type { DevicePreset } from '../../shared/types';
import { BEZEL, fitScale, viewportOf } from '../lib/layout';
import { activePresets, api, useStore } from '../store';
import { Icon } from './Icons';

const GROUPS: { kind: DevicePreset['kind']; label: string }[] = [
  { kind: 'phone', label: 'Téléphones' },
  { kind: 'tablet', label: 'Tablettes' },
  { kind: 'desktop', label: 'Écrans' },
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
      {GROUPS.map((g) => (
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
        <button aria-pressed={settings.landscape} onClick={() => void updateSettings({ landscape: !settings.landscape })} title="Paysage (Ctrl+Maj+O)" className={chip(settings.landscape)}>
          <Icon name="rotate" size={13} />
          Paysage
        </button>
        <button aria-pressed={settings.scrollSync} onClick={() => void updateSettings({ scrollSync: !settings.scrollSync })} title="Synchroniser scroll et navigation (Ctrl+Maj+S)" className={chip(settings.scrollSync)}>
          <span aria-hidden="true" className={`size-1.5 rounded-full ${settings.scrollSync ? 'bg-ok' : 'bg-ghost'}`} />
          Synchro
        </button>
        <span className="inline-flex h-[26px] items-center rounded-md border border-line px-2.5 font-mono text-xs text-muted">{Math.round(scale * 100)} %</span>
      </div>
    </div>
  );
}

export function Stage() {
  const state = useStore();
  const { settings, frozen } = state;
  const devices = activePresets(state);
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
                <button onClick={() => api().openDevtools(preset.id)} title="Ouvrir les DevTools de cet appareil" aria-label={`DevTools ${preset.label}`} className="rounded p-0.5 text-ghost hover:bg-active hover:text-fg">
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
