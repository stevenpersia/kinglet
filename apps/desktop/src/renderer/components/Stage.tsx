import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { locale, t } from '@kinglet/core';
import type { DevicePreset, RegionPrefs, Throttle } from '../../shared/types';
import { composeSheet, recordScroll } from '../lib/export';
import { activeProject } from '../../shared/projects';
import { BEZEL, fitScale, viewportOf } from '../lib/layout';
import { activePresets, api, cleanError, listedPresets, useStore } from '../store';
import { setActiveIds } from '../../shared/devices';
import { ConsoleTab } from './Console';
import { OldProdBanner } from './EnvSwitch';
import { Icon } from './Icons';
import { Welcome } from './Welcome';
import { InspectBar } from './InspectBar';
import { MocksDialog } from './MocksDialog';
import type { Viewport } from '../lib/layout';

const groups = (): { kind: DevicePreset['kind']; label: string }[] => [
  { kind: 'phone', label: t('Phones', 'Téléphones') },
  { kind: 'tablet', label: t('Tablets', 'Tablettes') },
  { kind: 'desktop', label: t('Screens', 'Écrans') },
];

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


const LOCALES = ['fr-FR', 'en-US', 'en-GB', 'de-DE', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL', 'ja-JP', 'zh-CN', 'ar-SA'];
const TIMEZONES = ['Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Montreal', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland'];
const PLACES: { label: string; latitude: number; longitude: number }[] = [
  { label: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { label: 'Lyon', latitude: 45.764, longitude: 4.8357 },
  { label: 'Bruxelles', latitude: 50.8503, longitude: 4.3517 },
  { label: 'Montréal', latitude: 45.5019, longitude: -73.5674 },
  { label: 'London', latitude: 51.5072, longitude: -0.1276 },
  { label: 'New York', latitude: 40.7128, longitude: -74.006 },
  { label: 'San Francisco', latitude: 37.7749, longitude: -122.4194 },
  { label: 'São Paulo', latitude: -23.5505, longitude: -46.6333 },
  { label: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { label: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
];
/** A country at once: language, time zone and position. */
const COUNTRIES = (): { label: string; region: RegionPrefs }[] => [
  { label: t('France', 'France'), region: { locale: 'fr-FR', timezone: 'Europe/Paris', geo: PLACES[0]! } },
  { label: t('United States', 'États-Unis'), region: { locale: 'en-US', timezone: 'America/New_York', geo: PLACES[5]! } },
  { label: t('United Kingdom', 'Royaume-Uni'), region: { locale: 'en-GB', timezone: 'Europe/London', geo: PLACES[4]! } },
  { label: t('Canada (Quebec)', 'Canada (Québec)'), region: { locale: 'fr-CA', timezone: 'America/Montreal', geo: PLACES[3]! } },
  { label: t('Brazil', 'Brésil'), region: { locale: 'pt-BR', timezone: 'America/Sao_Paulo', geo: PLACES[7]! } },
  { label: t('Japan', 'Japon'), region: { locale: 'ja-JP', timezone: 'Asia/Tokyo', geo: PLACES[8]! } },
  { label: t('Australia', 'Australie'), region: { locale: 'en-AU', timezone: 'Australia/Sydney', geo: PLACES[9]! } },
];

const regionLabel = (r: Partial<RegionPrefs>) => [r.locale, r.timezone?.split('/').pop()?.replace(/_/g, ' '), r.geo?.label].filter(Boolean).join(' · ');

const KIND_ICON = { phone: 'phone', tablet: 'tablet', desktop: 'laptop' } as const;

/** Trigger of a toolbar menu: plain text button, tinted when its setting is on. */
const menuButton = 'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-xs text-muted hover:bg-active hover:text-fg disabled:opacity-50 aria-expanded:bg-active aria-expanded:text-fg';

/** Opens a menu with the native views frozen as images (they would paint over it). */
function useMenu() {
  const { openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  /** Closes the menu but keeps the views frozen, for a dialog opened from it. */
  const handOff = () => setOpen(false);
  return { open, toggle, handOff };
}

/** One row: the devices, the view toggles, the emulation, then forms, export and zoom. */
function DeviceToolbar({ scale }: { scale: number }) {
  const state = useStore();
  const { settings, updateSettings } = state;
  // Only the devices ticked in the settings for this project.
  const presets = listedPresets(state);
  const active = activePresets(state).map((p) => p.id);
  const errors = state.logs.filter((l) => l.level === 'error').length;
  const toggle = (id: string) => {
    const on = active.includes(id);
    if (on && active.length === 1) return;
    const next = on ? active.filter((x) => x !== id) : [...active, id];
    // Keep the order chosen in the settings.
    void updateSettings(setActiveIds(state.presets, settings, next));
  };
  const kinds = groups().filter((g) => presets.some((p) => p.kind === g.kind));
  const iconButton = (on: boolean, tone: 'plain' | 'ok' = 'plain') =>
    `relative flex size-8 shrink-0 items-center justify-center rounded-[7px] ${on ? (tone === 'ok' ? 'bg-[rgba(125,211,168,0.12)] text-ok' : 'bg-raised text-fg') : 'text-muted hover:bg-active hover:text-fg'}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-chrome px-4 py-2">
      <div role="group" aria-label={t('Devices', 'Appareils')} className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-[9px] border border-line bg-card p-[3px]">
        {kinds.map((g, gi) => (
          <div key={g.kind} role="group" aria-label={g.label} className="flex min-w-0 flex-wrap items-center gap-0.5">
            {gi > 0 && <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />}
            {presets
              .filter((p) => p.kind === g.kind)
              .map((p) => {
                const on = active.includes(p.id);
                return (
                  <button
                    key={p.id}
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    title={on && active.length === 1 ? t('At least one device stays shown', 'Au moins un appareil reste affiché') : undefined}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap ${on ? 'bg-raised text-fg' : 'text-faint hover:bg-active hover:text-muted'}`}
                  >
                    <Icon name={KIND_ICON[p.kind]} size={12} />
                    {p.label}
                    <span className={`font-mono text-[10.5px] ${on ? 'text-faint' : 'text-ghost'}`}>{p.width}</span>
                  </button>
                );
              })}
          </div>
        ))}
        <button
          onClick={() => state.openSettings('devices')}
          aria-label={t('Add or remove devices', 'Ajouter ou retirer des appareils')}
          title={t('Add or remove devices', 'Ajouter ou retirer des appareils')}
          className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg"
        >
          <Icon name="plus" size={12} />
        </button>
      </div>

      <span aria-hidden="true" className="h-5 w-px bg-line" />

      <div role="group" aria-label={t('View', 'Affichage')} className="flex items-center gap-0.5">
        <button aria-pressed={state.inspecting} onClick={() => state.toggleInspect()} aria-label={t('Inspect', 'Inspecter')} title={t('Inspect an element on every device', 'Inspecter un élément sur tous les appareils')} className={iconButton(state.inspecting)}>
          <Icon name="target" size={15} />
        </button>
        <button
          aria-pressed={state.consoleOpen}
          onClick={() => state.toggleConsole()}
          aria-label={errors ? t(`Console, ${errors} errors`, `Console, ${errors} erreurs`) : 'Console'}
          title={t('Console and network errors of the devices', 'Erreurs console et réseau des appareils')}
          className={iconButton(state.consoleOpen)}
        >
          <Icon name="terminal" size={15} />
          {errors > 0 && <span className="absolute top-0.5 right-0 min-w-3.5 rounded-full bg-err px-1 font-mono text-[9px] leading-3.5 font-semibold text-bg">{errors > 99 ? '99+' : errors}</span>}
        </button>
        <button aria-pressed={settings.landscape} onClick={() => void updateSettings({ landscape: !settings.landscape })} aria-label={t('Landscape', 'Paysage')} title={t('Landscape (Ctrl+Shift+O)', 'Paysage (Ctrl+Maj+O)')} className={iconButton(settings.landscape)}>
          <Icon name="rotate" size={15} />
        </button>
        <button aria-pressed={settings.scrollSync} onClick={() => void updateSettings({ scrollSync: !settings.scrollSync })} aria-label={t('Sync scrolling', 'Synchro du scroll')} title={t('Sync scrolling and navigation (Ctrl+Shift+S)', 'Synchroniser scroll et navigation (Ctrl+Maj+S)')} className={iconButton(settings.scrollSync, 'ok')}>
          <Icon name="link" size={15} />
        </button>
      </div>

      <span aria-hidden="true" className="h-5 w-px bg-line" />

      <EmulationMenu />

      <div className="ml-auto flex items-center gap-1">
        <FormsMenu />
        <ExportMenu />
        <span title={t('Zoom to fit the window', 'Zoom pour tenir dans la fenêtre')} className="ml-1 inline-flex h-7 items-center rounded-md border border-line px-2 font-mono text-[11px] text-muted">
          {Math.round(scale * 100)}
          {t('%', ' %')}
        </span>
      </div>
    </div>
  );
}

/** A small segmented control (one choice among a few). */
function Segmented<T extends string | number>({ label, value, options, onChange, tone }: { label: string; value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void; tone?: (v: T) => string | null }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5 rounded-lg border border-line bg-bg p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={String(o.id)} role="radio" aria-checked={on} title={o.title} onClick={() => onChange(o.id)} className={`h-7 truncate rounded-[5px] px-1.5 text-xs ${on ? (tone?.(o.id) ?? 'bg-raised font-medium text-fg') : 'text-muted hover:text-fg'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const pill = (on: boolean) => `h-7 rounded-md border px-2.5 text-xs ${on ? 'border-line-strong bg-raised text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg'}`;
const section = 'text-[10.5px] font-medium tracking-[0.06em] text-faint uppercase';

/**
 * Appearance, region, network and keyboard in one popover. The button sums up what isn't at its
 * default, so what is simulated shows with the menu closed.
 */
function EmulationMenu() {
  const state = useStore();
  const { settings, updateSettings, closeOverlay } = state;
  const { open, toggle, handOff } = useMenu();
  const [target, setTarget] = useState<string>('all');
  const [mocksOpen, setMocksOpen] = useState(false);
  const m = settings.media;
  const text = settings.textSize;
  const th = settings.throttle;
  const all = settings.region;
  const per = settings.regionPerDevice ?? {};
  const own = Object.keys(per).filter((id) => Object.keys(per[id] ?? {}).length);
  const current: Partial<RegionPrefs> = target === 'all' ? all : { ...all, ...(per[target] ?? {}) };
  const devices = activePresets(state);
  const hasTouch = listedPresets(state).some((p) => p.kind !== 'desktop');
  const mocksOn = settings.mocks.filter((x) => x.enabled).length;

  const setMedia = (patch: Partial<typeof m>) => void updateSettings({ media: { ...m, ...patch } });
  const setText = (patch: Partial<typeof text>) => void updateSettings({ textSize: { ...text, ...patch } });
  const setThrottle = (patch: Partial<Throttle>) => void updateSettings({ throttle: { ...th, ...patch } });
  const setRegion = (patch: Partial<RegionPrefs>) => {
    if (target === 'all') void updateSettings({ region: { ...all, ...patch } });
    else void updateSettings({ regionPerDevice: { ...per, [target]: { ...(per[target] ?? {}), ...patch } } });
  };
  const network = settings.offline ? 'offline' : th.network;
  const setNetwork = (v: Throttle['network'] | 'offline') => void updateSettings(v === 'offline' ? { offline: true } : { offline: false, throttle: { ...th, network: v } });
  const resetAll = () =>
    void updateSettings({
      media: { colorScheme: 'auto', reducedMotion: false, moreContrast: false },
      textSize: { scale: 1, zoom: 1 },
      region: { locale: null, timezone: null, geo: null },
      regionPerDevice: {},
      throttle: { network: 'off', cpu: 1 },
      offline: false,
      keyboard: false,
    });

  // What isn't at its default, for the button.
  const summary: { text: string; tone: 'plain' | 'warn' | 'err' }[] = [
    m.colorScheme !== 'auto' ? { text: m.colorScheme === 'dark' ? t('Dark', 'Sombre') : t('Light', 'Clair'), tone: 'plain' as const } : null,
    m.reducedMotion ? { text: t('No motion', 'Sans animation'), tone: 'plain' as const } : null,
    m.moreContrast ? { text: t('Contrast', 'Contraste'), tone: 'plain' as const } : null,
    text.scale > 1 ? { text: t(`Text ${Math.round(text.scale * 100)}%`, `Texte ${Math.round(text.scale * 100)} %`), tone: 'plain' as const } : null,
    text.zoom > 1 ? { text: `Zoom ${text.zoom * 100}${t('%', ' %')}`, tone: 'plain' as const } : null,
    all.locale ? { text: all.locale, tone: 'plain' as const } : null,
    !all.locale && (all.timezone || all.geo) ? { text: regionLabel(all), tone: 'plain' as const } : null,
    own.length ? { text: t(`Region · ${own.length} device${own.length > 1 ? 's' : ''}`, `Région · ${own.length} appareil${own.length > 1 ? 's' : ''}`), tone: 'plain' as const } : null,
    settings.offline ? { text: t('Offline', 'Hors ligne'), tone: 'err' as const } : th.network !== 'off' ? { text: NETWORK.find((n) => n.id === th.network)!.label(), tone: 'warn' as const } : null,
    th.cpu > 1 ? { text: `CPU ×${th.cpu}`, tone: 'warn' as const } : null,
    mocksOn ? { text: t(`${mocksOn} mock${mocksOn > 1 ? 's' : ''}`, `${mocksOn} simulée${mocksOn > 1 ? 's' : ''}`), tone: 'warn' as const } : null,
    settings.keyboard && hasTouch ? { text: t('Keyboard', 'Clavier'), tone: 'plain' as const } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const shown = summary.slice(0, 3);
  const field = 'h-[30px] w-full min-w-0 rounded-md border border-line bg-bg px-2 text-xs text-fg outline-none focus:border-line-strong';

  return (
    <div className="relative min-w-0">
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        title={t('Appearance, region, network and keyboard of the devices', 'Apparence, région, réseau et clavier des appareils')}
        className={`inline-flex h-8 max-w-full items-center gap-2 rounded-lg border bg-card pr-2.5 pl-2 text-xs text-fg ${open ? 'border-local' : 'border-line-strong hover:border-[#4a4a52]'}`}
      >
        <Icon name="sliders" size={14} />
        {t('Emulation', 'Émulation')}
        {shown.length > 0 && (
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {shown.map((x) => (
              <span key={x.text} className={`shrink-0 rounded-[5px] px-1.5 py-0.5 text-[11px] leading-none whitespace-nowrap ${x.tone === 'err' ? 'bg-[rgba(242,139,130,0.14)] text-err' : x.tone === 'warn' ? 'bg-[rgba(230,192,123,0.14)] text-warn' : 'bg-raised text-muted'}`}>
                {x.text}
              </span>
            ))}
            {summary.length > shown.length && <span className="shrink-0 text-[11px] text-faint">+{summary.length - shown.length}</span>}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true" className="text-faint">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" fill="none" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="dialog" aria-label={t('Emulation', 'Émulation')} className="absolute top-10 left-0 z-50 flex max-h-[calc(100vh-290px)] w-[440px] flex-col rounded-xl border border-[#2a2a2f] bg-card shadow-2xl shadow-black/60">
            <div className="flex shrink-0 items-center gap-2 border-b border-line-soft px-3.5 py-3">
              <span className="text-[13px] font-semibold">{t('Emulation', 'Émulation')}</span>
              <span className="text-[11.5px] text-faint">{t('every device', 'tous les appareils')}</span>
              <span className="flex-1" />
              {summary.length > 0 && (
                <button onClick={resetAll} className="rounded px-1.5 py-1 text-[11.5px] text-local hover:bg-active">
                  {t('Reset all', 'Tout réinitialiser')}
                </button>
              )}
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3.5">
              <div className="flex flex-col gap-2">
                <span className={section}>{t('Appearance', 'Apparence')}</span>
                <Segmented
                  label={t('Color scheme', 'Thème')}
                  value={m.colorScheme}
                  onChange={(colorScheme) => setMedia({ colorScheme })}
                  options={[
                    { id: 'auto', label: t('Site default', 'Celui du site'), title: t('No preference', 'Pas de préférence') },
                    { id: 'light', label: t('Light', 'Clair'), title: 'prefers-color-scheme: light' },
                    { id: 'dark', label: t('Dark', 'Sombre'), title: 'prefers-color-scheme: dark' },
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  <button aria-pressed={m.reducedMotion} onClick={() => setMedia({ reducedMotion: !m.reducedMotion })} title="prefers-reduced-motion: reduce" className={pill(m.reducedMotion)}>
                    {t('Reduced motion', 'Animations réduites')}
                  </button>
                  <button aria-pressed={m.moreContrast} onClick={() => setMedia({ moreContrast: !m.moreContrast })} title="prefers-contrast: more" className={pill(m.moreContrast)}>
                    {t('High contrast', 'Contraste élevé')}
                  </button>
                  <button aria-pressed={text.zoom > 1} onClick={() => setText({ zoom: text.zoom > 1 ? 1 : 2 })} title={t('Reflows the page at half the width (WCAG 1.4.10)', 'Remet la page en page à la moitié de la largeur (WCAG 1.4.10)')} className={pill(text.zoom > 1)}>
                    {t('Page zoom 200%', 'Zoom 200 %')}
                  </button>
                  <button aria-pressed={state.tabOrder} onClick={() => state.toggleTabOrder()} title={t('Numbers the Tab order on every device', 'Numérote l’ordre Tab sur tous les appareils')} className={pill(state.tabOrder)}>
                    {t('Tab order', 'Ordre Tab')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11.5px] text-faint">{t('Text size', 'Taille du texte')}</span>
                  <div className="flex-1">
                    <Segmented label={t('Text size', 'Taille du texte')} value={text.scale} onChange={(scale) => setText({ scale })} options={[1, 1.3, 1.5, 2].map((k) => ({ id: k, label: `${Math.round(k * 100)}${t('%', ' %')}` }))} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className={section}>{t('Region', 'Région')}</span>
                  <span className="flex-1" />
                  <select aria-label={t('Applies to', 'S’applique à')} value={target} onChange={(e) => setTarget(e.target.value)} className="h-6 rounded-md border border-line bg-bg px-1 text-[11px] text-muted outline-none">
                    <option value="all">{t('Every device', 'Tous les appareils')}</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                        {per[d.id] && Object.keys(per[d.id]!).length ? ' ·' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1">
                  {COUNTRIES().map((c) => (
                    <button key={c.label} onClick={() => setRegion(c.region)} className={`h-6 rounded-md border px-2 text-[11px] ${current.locale === c.region.locale && current.timezone === c.region.timezone ? 'border-line-strong bg-raised text-fg' : 'border-line text-muted hover:border-line-strong'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
                    {t('Language', 'Langue')}
                    <select value={current.locale ?? ''} onChange={(e) => setRegion({ locale: e.target.value || null })} className={field}>
                      <option value="">{t('Computer’s', 'L’ordinateur')}</option>
                      {[...new Set([...LOCALES, ...(current.locale ? [current.locale] : [])])].map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
                    {t('Time zone', 'Fuseau')}
                    <select value={current.timezone ?? ''} onChange={(e) => setRegion({ timezone: e.target.value || null })} className={field}>
                      <option value="">{t('Computer’s', 'L’ordinateur')}</option>
                      {[...new Set([...TIMEZONES, ...(current.timezone ? [current.timezone] : [])])].map((z) => (
                        <option key={z} value={z}>
                          {z.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
                    {t('Position', 'Position')}
                    <select value={current.geo?.label ?? ''} onChange={(e) => setRegion({ geo: PLACES.find((p) => p.label === e.target.value) ?? null })} className={field}>
                      <option value="">{t('None (refused)', 'Aucune (refusée)')}</option>
                      {PLACES.map((p) => (
                        <option key={p.label} value={p.label}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
                  {t('Reload so the server sees the language.', 'Recharge pour que le serveur voie la langue.')}
                  {target !== 'all' && per[target] && (
                    <button
                      onClick={() => {
                        const { [target]: _gone, ...rest } = per;
                        void updateSettings({ regionPerDevice: rest });
                      }}
                      className="shrink-0 text-local hover:underline"
                    >
                      {t('Like the others', 'Comme les autres')}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className={section}>{t('Network and CPU', 'Réseau et CPU')}</span>
                <Segmented
                  label={t('Network', 'Réseau')}
                  value={network}
                  onChange={setNetwork}
                  tone={(v) => (v === 'offline' ? 'bg-[rgba(242,139,130,0.14)] font-medium text-err' : v !== 'off' ? 'bg-[rgba(230,192,123,0.14)] font-medium text-warn' : null)}
                  options={[...NETWORK.map((n) => ({ id: n.id as Throttle['network'] | 'offline', label: n.label(), title: n.hint() })), { id: 'offline', label: t('Offline', 'Hors ligne') }]}
                />
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11.5px] text-faint">CPU</span>
                  <div className="flex-1">
                    <Segmented label="CPU" value={th.cpu} onChange={(cpu) => setThrottle({ cpu })} tone={(v) => (v > 1 ? 'bg-[rgba(230,192,123,0.14)] font-medium text-warn' : null)} options={CPU.map((c) => ({ id: c.id, label: c.id === 1 ? '1×' : `×${c.id}`, title: c.label() }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
                  {t('Phones and tablets only, except Offline.', 'Téléphones et tablettes seulement, sauf Hors ligne.')}
                  <button
                    onClick={() => {
                      handOff();
                      setMocksOpen(true);
                    }}
                    className="shrink-0 text-local hover:underline"
                  >
                    {t(`Simulated API responses (${mocksOn})…`, `Réponses d’API simulées (${mocksOn})…`)}
                  </button>
                </div>
              </div>

              {hasTouch && (
                <div className="flex items-center gap-3 border-t border-line-soft pt-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs text-fg">{t('On-screen keyboard', 'Clavier virtuel')}</span>
                    <span className="text-[11.5px] text-faint">{t('Open on phones and tablets: what stays visible above it?', 'Ouvert sur les téléphones et tablettes : que reste-t-il de visible au-dessus ?')}</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.keyboard}
                    aria-label={t('On-screen keyboard', 'Clavier virtuel')}
                    onClick={() => void updateSettings({ keyboard: !settings.keyboard })}
                    className={`flex h-5 w-[34px] shrink-0 items-center rounded-full p-0.5 ${settings.keyboard ? 'justify-end bg-local' : 'justify-start bg-line-strong'}`}
                  >
                    <span className="size-4 rounded-full bg-fg" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {mocksOpen && (
        <MocksDialog
          onClose={() => {
            setMocksOpen(false);
            closeOverlay();
          }}
        />
      )}
    </div>
  );
}

/** Fill the forms of every device at once: good data, wrong data, or empty. Nothing is submitted. */
function FormsMenu() {
  const { openOverlay, closeOverlay, fillForms, url } = useStore();
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const run = (mode: 'valid' | 'invalid' | 'clear') => {
    setOpen(false);
    closeOverlay();
    void fillForms(mode);
  };
  const row = 'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs text-muted hover:bg-active/60 hover:text-fg';
  return (
    <div className="relative">
      <button aria-expanded={open} disabled={!url} onClick={toggle} title={t('Fill the forms of every device', 'Remplir les formulaires de tous les appareils')} className={menuButton}>
        <Icon name="form" size={14} />
        {t('Forms', 'Formulaires')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-10 right-0 z-50 w-80 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <button role="menuitem" onClick={() => run('valid')} className={row}>
              {t('Fill with valid data', 'Remplir avec des données valides')}
              <span className="font-mono text-[10.5px] text-ghost">✓</span>
            </button>
            <button role="menuitem" onClick={() => run('invalid')} className={row}>
              {t('Fill with wrong data', 'Remplir avec des données fausses')}
              <span className="font-mono text-[10.5px] text-ghost">✗</span>
            </button>
            <button role="menuitem" onClick={() => run('clear')} className={row}>
              {t('Empty the fields', 'Vider les champs')}
            </button>
            <p className="m-0 px-2.5 pt-2 pb-2 text-[11.5px] leading-normal text-faint">
              {t(
                'Every field of every device, in the devices’ language. Nothing is submitted: submit yourself to see the error messages. With wrong data, Kinglet lists the fields that accept anything.',
                'Tous les champs de tous les appareils, dans la langue des appareils. Rien n’est envoyé : soumets toi-même pour voir les messages d’erreur. Avec des données fausses, Kinglet liste les champs qui acceptent n’importe quoi.',
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

type ExportKind = 'sheet' | 'sheet-full' | 'pdf' | 'folder' | 'webm' | 'gif';

/** Captures of every device: a sheet, a PDF, separate images, or a video of the synced scroll. */
function ExportMenu() {
  const { openOverlay, closeOverlay, url, settings } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<{ kind: ExportKind; progress: number | null } | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const name = () => {
    const project = activeProject(settings)?.name ?? 'kinglet';
    let path = '';
    try {
      path = new URL(url ?? '').pathname.replace(/\//g, '-').replace(/^-|-$/g, '');
    } catch {
      /* no page */
    }
    return `${project}${path ? `-${path}` : ''}-${new Date().toISOString().slice(0, 10)}`.replace(/[^\w.-]+/g, '-');
  };
  const run = async (kind: ExportKind) => {
    setOpen(false);
    closeOverlay();
    setDone(null);
    setBusy({ kind, progress: null });
    await new Promise((r) => setTimeout(r, 350)); // the views come back on screen
    try {
      const title = url ?? '';
      let saved: string | null = null;
      if (kind === 'webm' || kind === 'gif') {
        const bytes = await recordScroll(kind, (p) => setBusy({ kind, progress: p }));
        saved = await api().export.save(bytes, `${name()}.${kind}`, kind);
      } else {
        const shots = await api().export.shots(kind !== 'sheet');
        if (!shots.length) throw new Error(t('No device to capture.', 'Aucun appareil à capturer.'));
        if (kind === 'pdf') saved = await api().export.pdf(shots, title, name());
        else if (kind === 'folder') saved = await api().export.folder(shots);
        else saved = await api().export.save(await composeSheet(shots, title), `${name()}.png`, 'png');
      }
      if (saved) setDone({ ok: true, text: t(`Saved: ${saved}`, `Enregistré : ${saved}`) });
    } catch (e) {
      setDone({ ok: false, text: cleanError(e) });
    } finally {
      setBusy(null);
      setTimeout(() => setDone(null), 6000);
    }
  };
  const row = 'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs text-muted hover:bg-active/60 hover:text-fg';
  const items: [ExportKind, string, string][] = [
    ['sheet', t('Sheet · screens', 'Planche · écrans'), 'PNG'],
    ['sheet-full', t('Sheet · whole pages', 'Planche · pages entières'), 'PNG'],
    ['pdf', t('PDF · one device per page', 'PDF · un appareil par page'), 'PDF'],
    ['folder', t('Separate images (folder)', 'Images séparées (dossier)'), 'PNG'],
    ['webm', t('Video of the scroll', 'Vidéo du scroll'), 'WebM'],
    ['gif', t('GIF of the scroll', 'GIF du scroll'), 'GIF'],
  ];
  return (
    <div className="relative">
      <button aria-expanded={open} disabled={!!busy || !url} onClick={toggle} title={t('Export the devices: images, PDF, video', 'Exporter les appareils : images, PDF, vidéo')} className={menuButton}>
        <Icon name="download" size={14} />
        {busy ? (busy.progress != null ? `${t('Recording', 'Enregistrement')} ${Math.round(busy.progress * 100)}${t('%', ' %')}` : t('Exporting…', 'Export…')) : t('Export', 'Exporter')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-10 right-0 z-50 w-72 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            {items.map(([id, label, hint], i) => (
              <div key={id}>
                {i === 4 && <div className="mx-1.5 my-1 h-px bg-line-soft" />}
                <button role="menuitem" onClick={() => void run(id)} className={row}>
                  {label}
                  <span className="font-mono text-[10.5px] text-ghost">{hint}</span>
                </button>
              </div>
            ))}
            <p className="m-0 px-2.5 pt-2 pb-2 text-[11.5px] leading-normal text-faint">
              {t('Whole pages stop at 10,000 px. The video scrolls every device from top to bottom in 6 s.', 'Les pages entières s’arrêtent à 10 000 px. La vidéo fait défiler tous les appareils de haut en bas en 6 s.')}
            </p>
          </div>
        </>
      )}
      {done && (
        <div role="status" className={`absolute top-10 right-0 z-30 w-80 rounded-lg border bg-card px-3 py-2 text-xs break-all shadow-xl shadow-black/50 ${done.ok ? 'border-line text-muted' : 'border-[#5c3330] text-err'}`}>
          {done.text}
        </div>
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
  // With the page zoom, the page's CSS px are bigger than the device's.
  const zoom = s.settings.textSize?.zoom || 1;
  const x = Math.round((fx * viewport.width) / zoom);
  const y = Math.round((fy * viewport.height) / zoom);
  // What the device showed when pointing started (a DevTools capture would wait for the hidden view).
  const shot = s.frozen?.[preset.id];
  const id = s.settings.activeId;
  const n = (id ? (s.shown[id] ?? 0) : 0) + 1;
  const [info, image] = await Promise.all([api().elementAt(preset.id, x, y), shot ? pinned(shot, fx, fy, n).catch(() => null) : Promise.resolve(null)]);
  s.stopPointing();
  if (s.pointingFor === 'feedback' && id) {
    // A review pin: numbered after the others of this project, the comment comes next.
    const pins = s.pins[id] ?? [];
    const num = Math.max(0, ...pins.map((p) => p.n)) + 1;
    const img = shot ? await pinned(shot, fx, fy, num).catch(() => null) : null;
    s.setPins(id, [...pins, { id: `p${Date.now().toString(36)}`, n: num, deviceId: preset.id, deviceLabel: preset.label, url: s.url ?? '', x, y, selector: info?.selector ?? null, elementText: info?.text?.slice(0, 120) || null, comment: '', image: img, createdAt: Date.now(), done: false }]);
    useStore.setState({ panel: 'feedback' });
    return;
  }
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
      <span className="flex-1">
        {useStore.getState().pointingFor === 'feedback'
          ? t('Click the spot on a device the comment is about.', 'Clique l’endroit d’un appareil dont parle le retour.')
          : t('Click a spot on a device to show it to Claude.', 'Clique un endroit d’un appareil pour le montrer à Claude.')}
      </span>
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
    <>
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
                  {frozen?.[preset.id] && <img src={frozen[preset.id]} alt="" className="block size-full object-cover object-left-top" />}
                </div>
              </div>
              <div style={{ maxWidth: w + pad * 2 + 80 }} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-faint [&>*]:whitespace-nowrap">
                <span>
                  {preset.label} · {viewport.width} × {viewport.height}
                </span>
                {settings.regionPerDevice?.[preset.id] && Object.keys(settings.regionPerDevice[preset.id]!).length > 0 && (
                  <span className="text-local" title={t('Region of this device', 'Région de cet appareil')}>
                    · {regionLabel({ ...settings.region, ...settings.regionPerDevice[preset.id] })}
                  </span>
                )}
                {state.tabInfo[preset.id] && (
                  <span className={state.tabInfo[preset.id]!.missing ? 'text-err' : 'text-ok'} title={t('Keyboard tour', 'Parcours au clavier')}>
                    · Tab {state.tabInfo[preset.id]!.count}
                    {state.tabInfo[preset.id]!.missing ? t(` · ${state.tabInfo[preset.id]!.missing} without focus`, ` · ${state.tabInfo[preset.id]!.missing} sans focus`) : ''}
                  </span>
                )}
                {perf[preset.id] && (
                  <span
                    title={t(`Loaded in ${seconds(perf[preset.id]!.loadMs)} (DOM ready ${seconds(perf[preset.id]!.domMs)}), ${perf[preset.id]!.requests} requests`, `Chargée en ${seconds(perf[preset.id]!.loadMs)} (DOM prêt ${seconds(perf[preset.id]!.domMs)}), ${perf[preset.id]!.requests} requêtes`)}
                    className={throttled(preset) ? 'text-warn' : ''}
                  >
                    · {seconds(perf[preset.id]!.loadMs)} · {weight(perf[preset.id]!.bytes)}
                  </span>
                )}
                {state.report?.vitals?.[preset.id]?.lcpMs != null && (
                  <span
                    title={t('Core Web Vitals: largest paint (good under 2.5 s) and layout shifts (good under 0.1)', 'Core Web Vitals : plus grand affichage (bon sous 2,5 s) et décalages (bon sous 0,1)')}
                    className={state.report.vitals[preset.id]!.lcpMs! > 2500 || (state.report.vitals[preset.id]!.cls ?? 0) > 0.1 ? 'text-warn' : ''}
                  >
                    · LCP {seconds(state.report.vitals[preset.id]!.lcpMs!)} · CLS {(state.report.vitals[preset.id]!.cls ?? 0).toFixed(2)}
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
      {state.inspecting && <InspectBar />}
      {state.tabOrder && <TabOrderBar />}
      {state.forms && <FormsBar />}
      </main>
      {state.consoleOpen && <ConsoleDock />}
    </>
  );
}

/** Live console of the devices, docked on their right (opened from the device bar). */
function ConsoleDock() {
  const toggleConsole = useStore((s) => s.toggleConsole);
  const errors = useStore((s) => s.logs.filter((l) => l.level === 'error').length);
  return (
    <aside aria-label={t('Console panel', 'Panneau de console')} className="flex w-[340px] shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft pr-2 pl-4">
        <span className="label">Console</span>
        <span className="flex items-center gap-2">
          {errors > 0 && <span className="font-mono text-xs text-err">{t(`${errors} error${errors > 1 ? 's' : ''}`, `${errors} erreur${errors > 1 ? 's' : ''}`)}</span>}
          <button onClick={() => toggleConsole(false)} aria-label={t('Close the console', 'Fermer la console')} title={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <ConsoleTab />
      </div>
    </aside>
  );
}

/** Keyboard tour: what the numbers mean, and Claude for the elements without visible focus. */
function TabOrderBar() {
  const s = useStore();
  const devices = activePresets(s);
  const missing = Object.values(s.tabInfo).reduce((a, i) => Math.max(a, i.missing), 0);
  const positive = Object.values(s.tabInfo).reduce((a, i) => Math.max(a, i.positive), 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.toggleTabOrder(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);
  const ask = () => {
    const focus = s.report?.a11y?.focus;
    s.askClaude(
      t(
        `On ${s.url ?? 'the page'}, ${missing} focusable elements show no visible keyboard focus${focus?.examples.length ? ` (${focus.examples.join(', ')})` : ''}${positive ? ` and ${positive} have a tabindex above 0` : ''}. Add a visible :focus-visible style (outline or equivalent, contrast 3:1) without changing the look for mouse users${positive ? ', and remove the positive tabindex' : ''}.`,
        `Sur ${s.url ?? 'la page'}, ${missing} éléments focusables ne montrent aucun focus clavier visible${focus?.examples.length ? ` (${focus.examples.join(', ')})` : ''}${positive ? ` et ${positive} ont un tabindex supérieur à 0` : ''}. Ajoute un style :focus-visible visible (outline ou équivalent, contraste 3:1) sans changer l’apparence pour la souris${positive ? ', et retire les tabindex positifs' : ''}.`,
      ),
    );
  };
  return (
    <section aria-label={t('Keyboard tour', 'Parcours au clavier')} className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft bg-chrome px-4 py-2.5 text-xs text-muted">
      <Icon name="tab" size={13} className="text-local" />
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#3e7bfa]" />{t('Tab order', 'Ordre Tab')}</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#e5484d]" />{t('no visible focus', 'pas de focus visible')}</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#e6a23c]" />{t('tabindex > 0 (jumps the queue)', 'tabindex > 0 (passe devant)')}</span>
      <span className="text-faint">{devices.map((d) => (s.tabInfo[d.id] ? `${d.label} ${s.tabInfo[d.id]!.count}` : null)).filter(Boolean).join(' · ')}</span>
      <span className="flex-1" />
      {missing > 0 && s.settings.claudePanel && (
        <button onClick={ask} className="h-7 rounded-ui border border-[rgba(217,119,87,0.35)] px-2.5 font-medium text-[#d97757] hover:bg-[rgba(217,119,87,0.1)]">
          {t('Ask Claude', 'Demander à Claude')}
        </button>
      )}
      <button onClick={() => s.toggleTabOrder(false)} aria-label={t('Stop the keyboard tour', 'Arrêter le parcours au clavier')} title={t('Stop (Esc)', 'Arrêter (Échap)')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
        <Icon name="close" size={12} />
      </button>
    </section>
  );
}

/** What the automatic filling found: fields filled, wrong data accepted, fields refused. */
function FormsBar() {
  const s = useStore();
  const f = s.forms!;
  const devices = activePresets(s);
  const accepted = [...new Set(Object.values(f.result).flatMap((r) => r.accepted))];
  const refused = [...new Set(Object.values(f.result).flatMap((r) => r.refused))];
  const filled = Math.max(0, ...Object.values(f.result).map((r) => r.filled));
  const ask = () =>
    s.askClaude(
      t(
        `On ${s.url ?? 'the page'}, these form fields accept wrong data without any validation: ${accepted.join(', ')}. Add the right type (email, tel, url), pattern or required attributes and a visible error message linked with aria-describedby, without changing the design.`,
        `Sur ${s.url ?? 'la page'}, ces champs de formulaire acceptent des données fausses sans aucune validation : ${accepted.join(', ')}. Ajoute le bon type (email, tel, url), pattern ou required et un message d’erreur visible relié par aria-describedby, sans changer le design.`,
      ),
    );
  return (
    <section aria-label={t('Forms', 'Formulaires')} className="flex max-h-[200px] shrink-0 flex-col gap-1.5 overflow-y-auto border-t border-line-soft bg-chrome px-4 py-2.5 text-xs text-muted">
      <div className="flex items-center gap-3">
        <Icon name="form" size={13} className="text-local" />
        <span className="text-fg">
          {!filled
            ? t('No form field on the devices.', 'Aucun champ de formulaire sur les appareils.')
            : f.mode === 'valid'
              ? t(`${filled} fields filled with valid data on ${devices.length} devices.`, `${filled} champs remplis avec des données valides sur ${devices.length} appareils.`)
              : t(`${filled} fields filled with wrong data on ${devices.length} devices.`, `${filled} champs remplis avec des données fausses sur ${devices.length} appareils.`)}
        </span>
        <span className="flex-1" />
        {accepted.length > 0 && s.settings.claudePanel && (
          <button onClick={ask} className="h-7 rounded-ui border border-[rgba(217,119,87,0.35)] px-2.5 font-medium text-[#d97757] hover:bg-[rgba(217,119,87,0.1)]">
            {t('Ask Claude', 'Demander à Claude')}
          </button>
        )}
        <button onClick={() => void s.fillForms('clear')} className="h-7 rounded-md border border-line px-2 text-[11px] hover:border-line-strong hover:text-fg">
          {t('Empty', 'Vider')}
        </button>
        <button onClick={() => useStore.setState({ forms: null })} aria-label={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
          <Icon name="close" size={12} />
        </button>
      </div>
      {f.mode === 'invalid' && filled > 0 && (
        <span className={accepted.length ? 'text-err' : 'text-ok'}>
          {accepted.length ? t(`Accept anything (no validation): ${accepted.join(', ')}`, `Acceptent n’importe quoi (aucune validation) : ${accepted.join(', ')}`) : t('Every field refuses the wrong data.', 'Chaque champ refuse les données fausses.')}
        </span>
      )}
      {refused.length > 0 && (
        <span>
          {f.mode === 'valid' ? t('Still refused: ', 'Encore refusés : ') : t('Refused by the browser: ', 'Refusés par le navigateur : ')}
          <span className="text-faint">{refused.slice(0, 6).join(' · ')}</span>
        </span>
      )}
    </section>
  );
}
