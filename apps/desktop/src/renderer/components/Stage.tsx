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
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 [&>*]:shrink-0 [&>button]:whitespace-nowrap [&>div>button]:whitespace-nowrap">
        <button
          aria-pressed={state.inspecting}
          onClick={() => state.toggleInspect()}
          title={t('Inspect an element on every device', 'Inspecter un élément sur tous les appareils')}
          className={chip(state.inspecting)}
        >
          <Icon name="target" size={13} />
          {t('Inspect', 'Inspecter')}
        </button>
        <button aria-pressed={state.consoleOpen} onClick={() => state.toggleConsole()} title={t('Console and network errors of the devices', 'Erreurs console et réseau des appareils')} className={chip(state.consoleOpen)}>
          <Icon name="terminal" size={13} />
          Console
          {errors > 0 && <span className="font-mono text-[10.5px] text-err">{errors}</span>}
        </button>
        <MediaMenu />
        <RegionMenu />
        <ThrottleMenu />
        {presets.some((p) => p.kind !== 'desktop') && (
          <button aria-pressed={settings.keyboard} onClick={() => void updateSettings({ keyboard: !settings.keyboard })} title={t('On-screen keyboard open on phones and tablets', 'Clavier virtuel ouvert sur les téléphones et tablettes')} className={chip(settings.keyboard)}>
            <Icon name="keyboard" size={13} />
            {t('Keyboard', 'Clavier')}
          </button>
        )}
        <ExportMenu />
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
  const text = settings.textSize;
  const tabOrder = useStore((st) => st.tabOrder);
  const toggleTabOrder = useStore((st) => st.toggleTabOrder);
  const on = m.colorScheme !== 'auto' || m.reducedMotion || m.moreContrast || text.scale > 1 || text.zoom > 1 || tabOrder;
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
  const label = [
    m.colorScheme === 'dark' ? t('Dark', 'Sombre') : m.colorScheme === 'light' ? t('Light', 'Clair') : null,
    m.reducedMotion ? t('No motion', 'Sans animation') : null,
    m.moreContrast ? t('Contrast', 'Contraste') : null,
    text.scale > 1 ? t(`Text ${Math.round(text.scale * 100)}%`, `Texte ${Math.round(text.scale * 100)} %`) : null,
    text.zoom > 1 ? t(`Zoom ${text.zoom * 100}%`, `Zoom ${text.zoom * 100} %`) : null,
    tabOrder ? 'Tab' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const setText = (patch: Partial<typeof text>) => void updateSettings({ textSize: { ...text, ...patch } });
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
            <div className="label px-2.5 pt-2 pb-1.5">{t('Text size', 'Taille du texte')}</div>
            <div className="flex gap-1 px-2.5 pb-1.5">
              {[1, 1.3, 1.5, 2].map((k) => (
                <button key={k} role="menuitemradio" aria-checked={text.scale === k} onClick={() => setText({ scale: k })} className={`h-7 flex-1 rounded-md border text-xs ${text.scale === k ? 'border-line-strong bg-active font-medium text-fg' : 'border-line text-muted hover:border-line-strong'}`}>
                  {Math.round(k * 100)}{t('%', ' %')}
                </button>
              ))}
            </div>
            <button role="menuitemcheckbox" aria-checked={text.zoom > 1} onClick={() => setText({ zoom: text.zoom > 1 ? 1 : 2 })} className={row(text.zoom > 1)}>
              {t('Page zoom 200%', 'Zoom de la page 200 %')}
              <span className="font-mono text-[10.5px] text-ghost">{text.zoom > 1 ? '✓ ' : ''}WCAG 1.4.10</span>
            </button>
            <p className="m-0 px-2.5 pt-1.5 pb-2 text-[11.5px] leading-normal text-faint">
              {t('Text size grows what is in rem, em or %, like the phone’s setting; text in px stays. The zoom reflows the page at half the width. The checks measure what gets cut.', 'La taille du texte grossit ce qui est en rem, em ou %, comme le réglage du téléphone ; le texte en px reste. Le zoom remet la page en page à la moitié de la largeur. Les checks mesurent ce qui est coupé.')}
            </p>
            <div className="mx-1.5 my-1 h-px bg-line-soft" />
            <button role="menuitemcheckbox" aria-checked={tabOrder} onClick={() => toggleTabOrder()} className={row(tabOrder)}>
              {t('Keyboard tour (Tab order)', 'Parcours au clavier (ordre Tab)')}
              <span className="font-mono text-[10.5px] text-ghost">{tabOrder ? '✓' : ''} Tab</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}


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

/** Language, time zone and position, for every device or one of them. */
function RegionMenu() {
  const state = useStore();
  const { settings, updateSettings, openOverlay, closeOverlay } = state;
  const devices = activePresets(state);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>('all');
  const all = settings.region;
  const per = settings.regionPerDevice ?? {};
  const current: Partial<RegionPrefs> = target === 'all' ? all : { ...all, ...(per[target] ?? {}) };
  const on = !!(all.locale || all.timezone || all.geo || Object.values(per).some((p) => Object.keys(p).length));
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const set = (patch: Partial<RegionPrefs>) => {
    if (target === 'all') void updateSettings({ region: { ...all, ...patch } });
    else void updateSettings({ regionPerDevice: { ...per, [target]: { ...(per[target] ?? {}), ...patch } } });
  };
  const field = 'h-7 w-full min-w-0 rounded-md border border-line bg-bg px-1.5 text-xs text-fg outline-none focus:border-line-strong';
  const own = Object.keys(per).filter((id) => Object.keys(per[id] ?? {}).length);
  return (
    <div className="relative">
      <button
        aria-pressed={on}
        aria-expanded={open}
        onClick={toggle}
        title={t('Language, time zone and position of the devices', 'Langue, fuseau horaire et position des appareils')}
        className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? 'border-[#3a3f5c] bg-[rgba(138,180,248,0.08)] font-medium text-local' : 'border-line text-muted hover:border-line-strong'}`}
      >
        <Icon name="globe" size={13} />
        {on ? regionLabel(all) || t(`${own.length} device${own.length > 1 ? 's' : ''}`, `${own.length} appareil${own.length > 1 ? 's' : ''}`) : t('Region', 'Région')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-8 right-0 z-50 flex w-80 flex-col gap-2 rounded-[10px] border border-line bg-card p-3 shadow-2xl shadow-black/60">
            <label className="flex flex-col gap-1">
              <span className="label">{t('Applies to', 'S’applique à')}</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
                <option value="all">{t('Every device', 'Tous les appareils')}</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                    {per[d.id] && Object.keys(per[d.id]!).length ? ` · ${regionLabel({ ...all, ...per[d.id] })}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-1">
              {COUNTRIES().map((c) => (
                <button key={c.label} onClick={() => set(c.region)} className={`h-6 rounded-md border px-2 text-[11px] ${current.locale === c.region.locale && current.timezone === c.region.timezone ? 'border-line-strong bg-active text-fg' : 'border-line text-muted hover:border-line-strong'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="label">{t('Language', 'Langue')}</span>
              <select value={current.locale ?? ''} onChange={(e) => set({ locale: e.target.value || null })} className={field}>
                <option value="">{t('The computer’s', 'Celle de l’ordinateur')}</option>
                {[...new Set([...LOCALES, ...(current.locale ? [current.locale] : [])])].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">{t('Time zone', 'Fuseau horaire')}</span>
              <select value={current.timezone ?? ''} onChange={(e) => set({ timezone: e.target.value || null })} className={field}>
                <option value="">{t('The computer’s', 'Celui de l’ordinateur')}</option>
                {[...new Set([...TIMEZONES, ...(current.timezone ? [current.timezone] : [])])].map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">{t('Position (geolocation)', 'Position (géolocalisation)')}</span>
              <select value={current.geo?.label ?? ''} onChange={(e) => set({ geo: PLACES.find((p) => p.label === e.target.value) ?? null })} className={field}>
                <option value="">{t('None (permission refused)', 'Aucune (permission refusée)')}</option>
                {PLACES.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] leading-snug text-faint">{t('Reload so the server sees the language (Accept-Language).', 'Recharge pour que le serveur voie la langue (Accept-Language).')}</span>
              <button
                onClick={() => {
                  if (target === 'all') void updateSettings({ region: { locale: null, timezone: null, geo: null } });
                  else {
                    const { [target]: _gone, ...rest } = per;
                    void updateSettings({ regionPerDevice: rest });
                  }
                }}
                className="h-7 shrink-0 rounded-md border border-line px-2 text-[11px] text-muted hover:border-line-strong hover:text-fg"
              >
                {target === 'all' ? t('Reset', 'Réinitialiser') : t('Like the others', 'Comme les autres')}
              </button>
            </div>
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
      <button aria-expanded={open} disabled={!!busy || !url} onClick={toggle} title={t('Export the devices: images, PDF, video', 'Exporter les appareils : images, PDF, vidéo')} className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:border-line-strong disabled:opacity-60">
        <Icon name="download" size={13} />
        {busy ? (busy.progress != null ? `${t('Recording', 'Enregistrement')} ${Math.round(busy.progress * 100)}${t('%', ' %')}` : t('Exporting…', 'Export…')) : t('Export', 'Exporter')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-8 right-0 z-50 w-72 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
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
        <div role="status" className={`absolute top-8 right-0 z-30 w-80 rounded-lg border bg-card px-3 py-2 text-xs break-all shadow-xl shadow-black/50 ${done.ok ? 'border-line text-muted' : 'border-[#5c3330] text-err'}`}>
          {done.text}
        </div>
      )}
    </div>
  );
}

/** Slow network and CPU for phones and tablets: a site is much slower there than on a PC. */
function ThrottleMenu() {
  const { settings, updateSettings, openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  const th = settings.throttle;
  const mocksOn = settings.mocks.filter((m) => m.enabled).length;
  const on = th.network !== 'off' || th.cpu > 1 || settings.offline || mocksOn > 0;
  const [mocksOpen, setMocksOpen] = useState(false);
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
        className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${settings.offline ? 'border-[#5c3330] bg-[rgba(242,139,130,0.08)] font-medium text-err' : on ? 'border-[#5c4a26] bg-[rgba(230,192,123,0.08)] font-medium text-warn' : 'border-line text-muted hover:border-line-strong'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20a8 8 0 1 1 8-8M12 12l4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
        {settings.offline
          ? t('Offline', 'Hors ligne')
          : on
            ? [th.network !== 'off' ? NETWORK.find((n) => n.id === th.network)!.label() : null, th.cpu > 1 ? `CPU ×${th.cpu}` : null, mocksOn ? t(`${mocksOn} simulated`, `${mocksOn} simulée${mocksOn > 1 ? 's' : ''}`) : null].filter(Boolean).join(' · ')
            : t('Full speed', 'Pleine vitesse')}
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
            <div className="mx-1.5 my-1 h-px bg-line-soft" />
            <button role="menuitemcheckbox" aria-checked={settings.offline} onClick={() => void updateSettings({ offline: !settings.offline })} className={row(settings.offline)}>
              {t('Offline', 'Hors ligne')}
              <span className={`font-mono text-[10.5px] ${settings.offline ? 'text-err' : 'text-ghost'}`}>{settings.offline ? t('on · every device', 'activé · tous') : t('every device', 'tous les appareils')}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setMocksOpen(true);
              }}
              className={row(false)}
            >
              {t('Simulated API responses…', 'Réponses d’API simulées…')}
              <span className="font-mono text-[10.5px] text-ghost">{t(`${mocksOn} on`, `${mocksOn} active${mocksOn > 1 ? 's' : ''}`)}</span>
            </button>
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
                  {frozen?.[preset.id] && <img src={frozen[preset.id]} alt="" className="block size-full object-cover object-top" />}
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
