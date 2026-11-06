import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { locale, t } from '@kinglet/core';
import type { DevicePreset, ElementInfo, RegionPrefs, Throttle } from '../../shared/types';
import { composeSheet, recordScroll } from '../lib/export';
import { activeProject } from '../../shared/projects';
import { BEZEL, fitScale, viewportOf } from '../lib/layout';
import { activePresets, api, cleanError, listedPresets, useStore } from '../store';
import { setActiveIds } from '../../shared/devices';
import { ConsoleTab } from './Console';
import { OldProdBanner } from './EnvSwitch';
import { Icon, type IconName } from './Icons';
import { Welcome } from './Welcome';
import { DevServerScreen, NewProjectScreen } from './DevServer';
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


      <div className="ml-auto flex items-center gap-1">
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

function useEmulation() {
  const state = useStore();
  const { settings, updateSettings } = state;
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
  const network: Throttle['network'] | 'offline' = settings.offline ? 'offline' : th.network;
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

  return { state, settings, updateSettings, target, setTarget, mocksOpen, setMocksOpen, m, text, th, all, per, own, current, devices, hasTouch, mocksOn, setMedia, setText, setThrottle, setRegion, network, setNetwork, resetAll, summary, shown, field };
}

export type Tool = 'emulation' | 'forms' | 'journeys' | 'export' | 'feedback';

/** Each tool panel has its colour: on its tab, its icon and the line along its top. */
const TOOLS = (): { id: Tool; label: string; icon: IconName; accent: string; tint: string }[] => [
  { id: 'emulation', label: t('Emulation', 'Émulation'), icon: 'sliders', accent: '#8ab4f8', tint: 'rgba(138,180,248,' },
  { id: 'forms', label: t('Forms', 'Formulaires'), icon: 'form', accent: '#7dd3a8', tint: 'rgba(125,211,168,' },
  { id: 'journeys', label: t('Journeys', 'Parcours'), icon: 'route', accent: '#c6f432', tint: 'rgba(198,244,50,' },
  { id: 'export', label: t('Export', 'Export'), icon: 'download', accent: '#e6c07b', tint: 'rgba(230,192,123,' },
  { id: 'feedback', label: t('Feedback', 'Retours'), icon: 'message', accent: '#f0a07f', tint: 'rgba(240,160,127,' },
];

/**
 * The tools' tabs, on the edge of the devices (right of the open panel): Emulation, Forms, Export.
 * Each opens its panel next to the devices, which stay live. A dot when the tool is doing something.
 */
function ToolTabs() {
  const state = useStore();
  const { summary } = useEmulation();
  const openPins = (state.settings.activeId ? (state.pins[state.settings.activeId] ?? []) : []).filter((p) => !p.done).length;
  const active: Record<Tool, string | null> = {
    emulation: summary.length ? summary.map((x) => x.text).join(' · ') : null,
    forms: state.forms ? (state.forms.mode === 'valid' ? t('Filled with valid data', 'Rempli avec des données valides') : t('Filled with wrong data', 'Rempli avec des données fausses')) : null,
    export: state.exporting ? t('Exporting…', 'Export…') : null,
    journeys: state.journeyRec ? t('Recording', 'Enregistrement') : state.journeyProgress ? t('Playing', 'En cours') : null,
    feedback: openPins ? t(`${openPins} open`, `${openPins} ouvert${openPins > 1 ? 's' : ''}`) : null,
  };
  return (
    <nav aria-label={t('Tools', 'Outils')} className="flex w-10 shrink-0 flex-col items-center gap-1.5 border-r border-line-soft bg-[#0b0b0b] pt-3">
      {TOOLS().map((tool) => {
        const on = state.panel === tool.id;
        return (
          <button
            key={tool.id}
            aria-pressed={on}
            aria-controls={`${tool.id}-panel`}
            onClick={() => state.togglePanel(tool.id)}
            disabled={(tool.id === 'forms' || tool.id === 'export' || tool.id === 'journeys') && !state.url}
            title={active[tool.id] ? `${tool.label} · ${active[tool.id]}` : tool.label}
            className={`relative flex w-8 flex-col items-center gap-2 rounded-[7px] px-1 py-3 text-[12px] transition-colors disabled:opacity-40 ${on ? 'text-fg' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
            style={on ? { background: `${tool.tint}0.12)`, boxShadow: `inset 0 0 0 1px ${tool.tint}0.35)` } : undefined}
          >
            <span style={{ color: on || active[tool.id] ? tool.accent : undefined }}>
              <Icon name={tool.icon} size={14} />
            </span>
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{tool.label}</span>
            {active[tool.id] && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full" style={{ background: tool.accent }} />}
          </button>
        );
      })}
    </nav>
  );
}

/** The frame shared by the tool panels: accent line, icon, title and subtitle, then the content. */
export function ToolPanel({ tool, subtitle, actions, children }: { tool: Tool; subtitle: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const state = useStore();
  const def = TOOLS().find((x) => x.id === tool)!;
  return (
    <aside id={`${tool}-panel`} aria-label={def.label} className="relative flex w-[350px] shrink-0 flex-col border-r border-line-soft bg-[#131314]">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${def.accent} 30%, ${def.accent} 70%, transparent)` }} />
      <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ color: def.accent, background: `${def.tint}0.12)`, boxShadow: `inset 0 0 0 1px ${def.tint}0.25)` }}>
          <Icon name={def.icon} size={15} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13.5px] font-semibold">{def.label}</span>
          <span className="flex items-center gap-1.5 truncate text-[11.5px] text-faint">{subtitle}</span>
        </span>
        {actions}
        <button onClick={() => state.togglePanel(tool)} aria-label={t('Close', 'Fermer')} title={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

const live = (n: number) => (
  <>
    <span className="size-1.5 shrink-0 rounded-full bg-ok" />
    {t(`Live on ${n} device${n > 1 ? 's' : ''}`, `En direct sur ${n} appareil${n > 1 ? 's' : ''}`)}
  </>
);

/**
 * Emulation, docked next to the devices like Page and Checks: the devices stay live, so every change
 * (tab order, text size, dark mode, region, network…) shows on all of them at once. Styled apart from
 * the other panels: a tool you keep open while testing, not a report.
 */
export function EmulationPanel() {
  const { state, settings, updateSettings, target, setTarget, mocksOpen, setMocksOpen, m, text, th, all, per, current, devices, hasTouch, mocksOn, setMedia, setText, setThrottle, setRegion, network, setNetwork, resetAll, summary, field } = useEmulation();
  void all;
  return (
    <ToolPanel
      tool="emulation"
      subtitle={live(devices.length)}
      actions={
        summary.length > 0 && (
          <button onClick={resetAll} className="rounded px-1.5 py-1 text-[11.5px] text-local hover:bg-active">
            {t('Reset all', 'Tout réinitialiser')}
          </button>
        )
      }
    >
            <div className="emulation-body flex flex-col gap-3 p-3">
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
                  <span className="w-[68px] shrink-0 text-[11.5px] text-faint">{t('Text size', 'Taille du texte')}</span>
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
                <div className="grid grid-cols-1 gap-2">
                  <label className="grid min-w-0 grid-cols-[88px_1fr] items-center gap-2 text-[11.5px] text-faint">
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
                  <label className="grid min-w-0 grid-cols-[88px_1fr] items-center gap-2 text-[11.5px] text-faint">
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
                  <label className="grid min-w-0 grid-cols-[88px_1fr] items-center gap-2 text-[11.5px] text-faint">
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
                  <span className="w-[68px] shrink-0 text-[11.5px] text-faint">CPU</span>
                  <div className="flex-1">
                    <Segmented label="CPU" value={th.cpu} onChange={(cpu) => setThrottle({ cpu })} tone={(v) => (v > 1 ? 'bg-[rgba(230,192,123,0.14)] font-medium text-warn' : null)} options={CPU.map((c) => ({ id: c.id, label: c.id === 1 ? '1×' : `×${c.id}`, title: c.label() }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
                  {t('Phones and tablets only, except Offline.', 'Téléphones et tablettes seulement, sauf Hors ligne.')}
                  <button
                    onClick={() => {
                      void state.openOverlay().then(() => setMocksOpen(true));
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
      {mocksOpen && (
        <MocksDialog
          onClose={() => {
            setMocksOpen(false);
            state.closeOverlay();
          }}
        />
      )}
    </ToolPanel>
  );
}

const bigRow = 'flex w-full items-center gap-3 rounded-[10px] border border-line-soft bg-[#1a1a1b] px-3.5 py-3 text-left hover:border-line-strong disabled:opacity-50';

/** Fill the forms of every device at once: good data, wrong data, or empty. Nothing is submitted. */
export function FormsPanel() {
  const state = useStore();
  const { fillForms, forms, url } = state;
  const n = activePresets(state).length;
  const invalid = forms?.mode === 'invalid' ? Object.values(forms.result) : [];
  const accepting = [...new Set(invalid.flatMap((r) => r.accepted ?? []))];
  const options: { mode: 'valid' | 'invalid' | 'clear'; title: string; text: string; mark: string }[] = [
    { mode: 'valid', title: t('Valid data', 'Données valides'), text: t('A real-looking person in the devices’ language.', 'Une personne crédible, dans la langue des appareils.'), mark: '✓' },
    { mode: 'invalid', title: t('Wrong data', 'Données fausses'), text: t('Then Kinglet lists the fields that accept anything.', 'Puis Kinglet liste les champs qui acceptent n’importe quoi.'), mark: '✗' },
    { mode: 'clear', title: t('Empty the fields', 'Vider les champs'), text: t('Back to the page as it loaded.', 'Retour à la page telle qu’elle s’est chargée.'), mark: '∅' },
  ];
  return (
    <ToolPanel tool="forms" subtitle={live(n)}>
      <div className="flex flex-col gap-2.5 p-3">
        {options.map((o) => (
          <button key={o.mode} disabled={!url} onClick={() => void fillForms(o.mode)} className={`${bigRow} ${forms?.mode === o.mode ? 'border-ok/40 bg-ok/[0.06]' : ''}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-active font-mono text-[12px] text-ok">{o.mark}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium">{o.title}</span>
              <span className="text-[11.5px] text-faint">{o.text}</span>
            </span>
          </button>
        ))}
        {forms?.mode === 'invalid' && (
          <div className="rounded-[10px] border border-line-soft bg-[#1a1a1b] p-3 text-xs">
            {accepting.length ? (
              <>
                <span className="font-medium text-warn">{t(`${accepting.length} field${accepting.length > 1 ? 's' : ''} accept${accepting.length > 1 ? '' : 's'} anything`, `${accepting.length} champ${accepting.length > 1 ? 's' : ''} accepte${accepting.length > 1 ? 'nt' : ''} n’importe quoi`)}</span>
                <span className="mt-1 block text-muted">{accepting.join(', ')}</span>
              </>
            ) : (
              <span className="text-ok">{t('Every field refuses wrong data.', 'Chaque champ refuse les données fausses.')}</span>
            )}
          </div>
        )}
        <p className="m-0 px-1 pt-1 text-[11.5px] leading-normal text-faint">
          {t(
            'Every field of every device. Nothing is submitted: submit yourself to see the error messages.',
            'Tous les champs de tous les appareils. Rien n’est envoyé : soumets toi-même pour voir les messages d’erreur.',
          )}
        </p>
      </div>
    </ToolPanel>
  );
}

type ExportKind = 'sheet' | 'sheet-full' | 'pdf' | 'folder' | 'webm' | 'gif';

/** Captures of every device: a sheet, a PDF, separate images, or a video of the synced scroll. */
export function ExportPanel() {
  const state = useStore();
  const { url, settings } = state;
  const [busy, setBusy] = useState<{ kind: ExportKind; progress: number | null } | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
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
    setDone(null);
    setBusy({ kind, progress: null });
    useStore.setState({ exporting: true });
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
      useStore.setState({ exporting: false });
    }
  };
  const groups: { title: string; items: [ExportKind, string, string][] }[] = [
    {
      title: t('Images', 'Images'),
      items: [
        ['sheet', t('Sheet of the screens', 'Planche des écrans'), 'PNG'],
        ['sheet-full', t('Sheet of whole pages', 'Planche des pages entières'), 'PNG'],
        ['folder', t('One image per device', 'Une image par appareil'), t('folder', 'dossier')],
      ],
    },
    { title: 'PDF', items: [['pdf', t('One device per page', 'Un appareil par page'), 'PDF']] },
    {
      title: t('Scrolling', 'Défilement'),
      items: [
        ['webm', t('Video of every device scrolling', 'Vidéo de tous les appareils qui défilent'), 'WebM'],
        ['gif', t('GIF of every device scrolling', 'GIF de tous les appareils qui défilent'), 'GIF'],
      ],
    },
  ];
  const n = activePresets(state).length;
  return (
    <ToolPanel tool="export" subtitle={t(`${n} device${n > 1 ? 's' : ''}, as they are now`, `${n} appareil${n > 1 ? 's' : ''}, tels qu’ils sont`)}>
      <div className="flex flex-col gap-3 p-3">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <span className={`${section} px-1`}>{g.title}</span>
            {g.items.map(([id, label, hint]) => (
              <button key={id} disabled={!!busy || !url} onClick={() => void run(id)} className={bigRow}>
                <span className="min-w-0 flex-1 text-[13px]">{busy?.kind === id ? (busy.progress != null ? `${t('Recording', 'Enregistrement')} ${Math.round(busy.progress * 100)}${t('%', ' %')}` : t('Exporting…', 'Export…')) : label}</span>
                <span className="rounded bg-active px-1.5 py-0.5 font-mono text-[10.5px] text-warn">{hint}</span>
              </button>
            ))}
          </div>
        ))}
        {done && (
          <p role="status" className={`m-0 rounded-[10px] border px-3 py-2.5 text-xs break-all ${done.ok ? 'border-line-soft bg-[#1a1a1b] text-muted' : 'border-[#5c3330] text-err'}`}>
            {done.text}
          </p>
        )}
        <p className="m-0 px-1 text-[11.5px] leading-normal text-faint">
          {t('Whole pages stop at 10,000 px. The video scrolls every device from top to bottom in 6 s.', 'Les pages entières s’arrêtent à 10 000 px. La vidéo fait défiler tous les appareils de haut en bas en 6 s.')}
        </p>
      </div>
    </ToolPanel>
  );
}

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`);
const weight = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} ${t('KB', 'Ko')}` : `${(b / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t('MB', 'Mo')}`);

type Box = { x: number; y: number; w: number; h: number };

/**
 * The capture with a numbered pin, as a JPEG: on the pinned element (its box, the number in its corner),
 * or on the spot pointed at (fx, fy: 0..1) when no element was picked.
 */
async function pinned(src: string, fx: number, fy: number, n: number, box?: Box | null): Promise<string> {
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
  let x = fx * c.width;
  let y = fy * c.height;
  if (box) {
    const bx = box.x * c.width;
    const by = box.y * c.height;
    const bw = box.w * c.width;
    const bh = box.h * c.height;
    g.fillStyle = 'rgba(217,119,87,0.16)';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = '#d97757';
    g.lineWidth = Math.max(2, c.width / 300);
    g.strokeRect(bx, by, bw, bh);
    // The number on the box's corner, kept inside the capture.
    x = Math.min(c.width - r, Math.max(r, bx));
    y = Math.min(c.height - r, Math.max(r, by));
  } else {
    g.fillStyle = 'rgba(217,119,87,0.3)';
    g.beginPath();
    g.arc(x, y, r * 1.6, 0, Math.PI * 2);
    g.fill();
  }
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

/** An element's box (CSS px of the page) as fractions of its device's capture. */
function boxOf(rect: ElementInfo['rect'], viewport: Viewport, zoom: number): Box | null {
  const x = Math.max(0, (rect.x * zoom) / viewport.width);
  const y = Math.max(0, (rect.y * zoom) / viewport.height);
  const w = Math.min(1 - x, ((rect.x + rect.width) * zoom) / viewport.width - x);
  const h = Math.min(1 - y, ((rect.y + rect.height) * zoom) / viewport.height - y);
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Where the mouse is on a device, in CSS px of its page. */
function pagePoint(viewport: Viewport, el: HTMLElement, e: React.MouseEvent) {
  const r = el.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  // With the page zoom, the page's CSS px are bigger than the device's.
  const zoom = useStore.getState().settings.textSize?.zoom || 1;
  return { fx, fy, zoom, x: Math.round((fx * viewport.width) / zoom), y: Math.round((fy * viewport.height) / zoom) };
}

/**
 * "Show Claude" or a review pin: the click on a device picks the element under it, like the inspector
 * (Alt + click: just the spot). It becomes a capture with the element boxed and numbered.
 */
async function pointAt(preset: DevicePreset, viewport: Viewport, el: HTMLElement, e: React.MouseEvent) {
  const s = useStore.getState();
  const { fx, fy, zoom, x, y } = pagePoint(viewport, el, e);
  const spot = e.altKey;
  // What the device showed when pointing started (a DevTools capture would wait for the hidden view).
  const shot = s.frozen?.[preset.id];
  const id = s.settings.activeId;
  const info = await api().elementAt(preset.id, x, y);
  const box = !spot && info ? boxOf(info.rect, viewport, zoom) : null;
  s.stopPointing();
  if (s.pointingFor === 'feedback' && id) {
    // A review pin: numbered after the others of this project, the comment comes next.
    const pins = s.pins[id] ?? [];
    const num = Math.max(0, ...pins.map((p) => p.n)) + 1;
    const img = shot ? await pinned(shot, fx, fy, num, box).catch(() => null) : null;
    s.setPins(id, [...pins, { id: `p${Date.now().toString(36)}`, n: num, deviceId: preset.id, deviceLabel: preset.label, url: s.url ?? '', x, y, selector: spot ? null : (info?.selector ?? null), elementText: spot ? null : info?.text?.slice(0, 120) || null, comment: '', image: img, box, createdAt: Date.now(), done: false }]);
    useStore.setState({ panel: 'feedback' });
    return;
  }
  const n = (id ? (s.shown[id] ?? 0) : 0) + 1;
  const image = shot ? await pinned(shot, fx, fy, n, box).catch(() => null) : null;
  const where = `${preset.label} (${viewport.width}×${viewport.height})`;
  s.askClaude('', [
    ...(image ? [{ kind: 'image' as const, label: t(`${preset.label} · pin ${n}`, `${preset.label} · épingle ${n}`), dataUrl: image }] : []),
    {
      kind: 'context' as const,
      label: t(`pointed-element-${n}`, `element-montre-${n}`),
      text: [
        `Pin ${n} on ${where}, at x=${x}, y=${y} CSS px (page ${s.url ?? ''}).`,
        info && !spot ? `Element: ${info.selector} <${info.tag}>, box ${Math.round(info.rect.x)},${Math.round(info.rect.y)} ${Math.round(info.rect.width)}×${Math.round(info.rect.height)}` : info ? `Under the spot: ${info.selector} <${info.tag}>` : 'Element: unknown',
        info?.text ? `Text: ${info.text}` : '',
        info?.html ? `HTML: ${info.html}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]);
}

/** The element under the mouse while pointing: boxed on its device, dashed on the others (like the inspector). */
type PointHover = { deviceId: string; selector: string; tag: string; rect: ElementInfo['rect']; others: Record<string, ElementInfo['rect'] | null> };

function usePointHover(pointing: boolean) {
  const [hover, setHover] = useState<PointHover | null>(null);
  const busy = useRef(false);
  const next = useRef<{ deviceId: string; x: number; y: number } | null>(null);
  const lastSelector = useRef<string | null>(null);
  useEffect(() => {
    if (!pointing) {
      setHover(null);
      lastSelector.current = null;
      next.current = null;
    }
  }, [pointing]);
  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (next.current) {
        const q = next.current;
        next.current = null;
        const info = await api().elementAt(q.deviceId, q.x, q.y);
        if (!useStore.getState().pointing) break;
        if (!info) {
          setHover(null);
          lastSelector.current = null;
          continue;
        }
        let others: PointHover['others'] = {};
        if (info.selector !== lastSelector.current) others = await api().rectsOf(info.selector).catch(() => ({}));
        lastSelector.current = info.selector;
        setHover((h) => ({ deviceId: q.deviceId, selector: info.selector, tag: info.tag, rect: info.rect, others: info.selector === h?.selector && !Object.keys(others).length ? h.others : others }));
      }
    } finally {
      busy.current = false;
    }
  };
  const move = (deviceId: string, viewport: Viewport, el: HTMLElement, e: React.MouseEvent) => {
    if (e.altKey) {
      setHover(null);
      lastSelector.current = null;
      return;
    }
    const { x, y } = pagePoint(viewport, el, e);
    next.current = { deviceId, x, y };
    void run();
  };
  return { hover, move, leave: () => setHover(null) };
}

/** The box drawn over a frozen device while pointing. */
function HoverBox({ box, label, dashed }: { box: Box; label?: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-hover-box={dashed ? 'other' : 'own'}
      className={`pointer-events-none absolute rounded-[3px] ${dashed ? 'border border-dashed border-[#d97757]/70' : 'border-2 border-[#d97757] bg-[#d97757]/15'}`}
      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
    >
      {label && (
        <span className={`absolute left-[-2px] flex items-center gap-1.5 whitespace-nowrap rounded bg-[#d97757] px-1.5 py-px font-mono text-[10px] font-medium text-white ${box.y < 0.04 ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
          {label}
        </span>
      )}
    </span>
  );
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
          ? t('Click an element to pin it · Alt: a free spot', 'Clique un élément pour l’épingler · Alt : un point libre')
          : t('Click an element to show it to Claude · Alt: a free spot', 'Clique un élément pour le montrer à Claude · Alt : un point libre')}
      </span>
      <button onClick={stopPointing} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-fg hover:border-line-strong">
        {t('Cancel (Esc)', 'Annuler (Échap)')}
      </button>
    </div>
  );
}

export function Stage() {
  const state = useStore();
  const dev = state.settings.activeId ? state.dev[state.settings.activeId] : undefined;
  if (dev && (dev.status === 'installing' || dev.status === 'starting' || dev.status === 'error')) return <DevServerScreen />;
  const active = state.settings.projects.find((p) => p.id === state.settings.activeId);
  if (!state.url && active?.folder && !active.localOrigin && !active.lastUrl) return <NewProjectScreen />;
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
  const point = usePointHover(state.pointing);
  const zoom = settings.textSize?.zoom || 1;
  // The pins already on this page, shown while pinning another one.
  const placed = state.pointing && state.pointingFor === 'feedback' && settings.activeId ? (state.pins[settings.activeId] ?? []).filter((p) => !p.done && p.url === state.url) : [];

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
      <main className="stage-bg relative flex min-w-0 flex-1">
      <ToolTabs />
      <div className="relative flex min-w-0 flex-1 flex-col">
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
                  className={`relative overflow-hidden bg-card ${state.pointing ? 'cursor-crosshair ring-2 ring-[#d97757]/60' : ''}`}
                  style={{ width: w, height: h, borderRadius: radius }}
                  onClick={state.pointing ? (e) => void pointAt(preset, viewport, e.currentTarget, e) : undefined}
                  onMouseMove={state.pointing ? (e) => point.move(preset.id, viewport, e.currentTarget, e) : undefined}
                  onMouseLeave={state.pointing ? point.leave : undefined}
                >
                  {frozen?.[preset.id] && <img src={frozen[preset.id]} alt="" className="block size-full object-cover object-left-top" />}
                  {placed
                    .filter((p) => p.deviceId === preset.id)
                    .map((p) => (
                      <span key={p.id} aria-hidden="true" className="pointer-events-none absolute flex size-[18px] -translate-1/2 items-center justify-center rounded-full bg-[#d97757] text-[10px] font-semibold text-white ring-4 ring-[#d97757]/30" style={{ left: `${Math.min(100, ((p.x * zoom) / viewport.width) * 100)}%`, top: `${Math.min(100, ((p.y * zoom) / viewport.height) * 100)}%` }}>
                        {p.n}
                      </span>
                    ))}
                  {state.pointing &&
                    point.hover &&
                    (() => {
                      const own = point.hover.deviceId === preset.id;
                      const rect = own ? point.hover.rect : point.hover.others[preset.id];
                      const box = rect ? boxOf(rect, viewport, zoom) : null;
                      if (!box) return null;
                      const last = point.hover.selector.split(' > ').pop();
                      return <HoverBox box={box} dashed={!own} label={own ? `${last} · ${Math.round(rect!.width)} × ${Math.round(rect!.height)}` : undefined} />;
                    })()}
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
      </div>
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
