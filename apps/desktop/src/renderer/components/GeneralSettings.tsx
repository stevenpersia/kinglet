import { t } from '@kinglet/core';
import { useState } from 'react';
import type { CustomDevice, DevicePreset, Language, Settings, Throttle } from '../../shared/types';
import { setActiveIds } from '../../shared/devices';
import { activePresets, devicePresets, useStore } from '../store';
import { Icon, Kbd } from './Icons';

const field = 'h-8 rounded-ui border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-line-strong';

function Group({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 overflow-hidden rounded-[10px] border border-line bg-card">{children}</div>;
}

function Row({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-line-soft px-3.5 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit shrink-0 gap-0.5 rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={`flex h-7 items-center rounded-md px-3 text-xs font-medium whitespace-nowrap ${value === o.id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : o.disabled ? 'cursor-default text-ghost' : 'text-faint hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-[18px] w-[30px] shrink-0 rounded-full ${on ? 'bg-fg' : 'bg-raised shadow-[inset_0_0_0_1px_#34343a]'}`}>
      <span className={`absolute top-[3px] size-3 rounded-full transition-[left] motion-reduce:transition-none ${on ? 'left-[15px] bg-bg' : 'left-[3px] bg-faint'}`} />
    </button>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(e) => onChange(options.find((o) => String(o.id) === e.target.value)!.id)}
      className={`${field} w-56 shrink-0`}
    >
      {options.map((o) => (
        <option key={String(o.id)} value={String(o.id)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const SHORTCUTS = (): [string, string][] => [
  ['Ctrl K', t('Command palette', 'Palette de commandes')],
  ['Ctrl P', t('Switch project', 'Changer de projet')],
  [t('Ctrl Shift A', 'Ctrl Maj A'), t('All projects', 'Tous les projets')],
  ['Ctrl 1…9', t('Go to tab', 'Aller à l’onglet')],
  ['Ctrl L', t('Change address', 'Changer d’adresse')],
  ['Ctrl R', t('Reload devices', 'Recharger les appareils')],
  [t('Ctrl Shift O', 'Ctrl Maj O'), t('Portrait / landscape', 'Portrait / paysage')],
  [t('Ctrl Shift S', 'Ctrl Maj S'), t('Scroll sync', 'Synchro du défilement')],
  ['Ctrl J', t('Claude panel', 'Panneau Claude')],
  ['Ctrl ,', t('Settings', 'Réglages')],
];

export function GeneralSettings() {
  const { settings, updateSettings } = useStore();
  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  const th = settings.throttle;
  return (
    <>
      <Group>
        <Row title={t('App language', 'Langue de l’app')} hint={t('Changes right away, no restart.', 'Change tout de suite, sans redémarrer.')}>
          <Segmented<Language>
            label={t('Language', 'Langue')}
            value={settings.language}
            onChange={(language) => set({ language })}
            options={[
              { id: 'system', label: t('System', 'Système') },
              { id: 'en', label: 'English' },
              { id: 'fr', label: 'Français' },
            ]}
          />
        </Row>
        <Row title={t('At launch', 'Au lancement')} hint={t('What Kinglet opens when it starts.', 'Ce que Kinglet ouvre au démarrage.')}>
          <Select
            label={t('At launch', 'Au lancement')}
            value={settings.startup}
            onChange={(startup) => set({ startup })}
            options={[
              { id: 'restore', label: t('Reopen the open projects', 'Rouvrir les projets ouverts') },
              { id: 'projects', label: t('Show all projects', 'Afficher tous les projets') },
            ]}
          />
        </Row>
        <Row title={t('Default section', 'Section par défaut')} hint={t('What you see when you open a project.', 'Ce qu’on voit en ouvrant un projet.')}>
          <Select
            label={t('Default section', 'Section par défaut')}
            value={settings.defaultSection}
            onChange={(defaultSection) => set({ defaultSection })}
            options={[
              { id: 'apercu', label: t('Devices', 'Appareils') },
              { id: 'deploiements', label: t('Deployments', 'Déploiements') },
              { id: 'partage', label: t('Share', 'Partage') },
              { id: 'checks', label: 'Checks' },
            ]}
          />
        </Row>
      </Group>

      <Group>
        <Row title={t('Synced scrolling', 'Défilement synchronisé')} hint={t('Scrolling or navigating one device moves the others.', 'Faire défiler ou naviguer sur un appareil entraîne les autres.')}>
          <Switch label={t('Synced scrolling', 'Défilement synchronisé')} on={settings.scrollSync} onChange={(scrollSync) => set({ scrollSync })} />
        </Row>
        <Row title={t('Orientation', 'Orientation')} hint={t('For phones and tablets.', 'Pour les téléphones et les tablettes.')}>
          <Segmented
            label={t('Orientation', 'Orientation')}
            value={settings.landscape ? 'landscape' : 'portrait'}
            onChange={(v) => set({ landscape: v === 'landscape' })}
            options={[
              { id: 'portrait', label: 'Portrait' },
              { id: 'landscape', label: t('Landscape', 'Paysage') },
            ]}
          />
        </Row>
        <Row title={t('Network', 'Réseau')} hint={t('Slowdown on phones and tablets only.', 'Ralentissement sur téléphones et tablettes seulement.')}>
          <Select<Throttle['network']>
            label={t('Network', 'Réseau')}
            value={th.network}
            onChange={(network) => set({ throttle: { ...th, network } })}
            options={[
              { id: 'off', label: t('Fast (your connection)', 'Rapide (ta connexion)') },
              { id: '4g', label: t('Slow 4G', '4G lente') },
              { id: '3g', label: t('Slow 3G', '3G lente') },
            ]}
          />
        </Row>
        <Row title="CPU" hint={t('A phone is several times slower than a computer.', 'Un téléphone est plusieurs fois plus lent qu’un ordinateur.')}>
          <Select<Throttle['cpu']>
            label="CPU"
            value={th.cpu}
            onChange={(cpu) => set({ throttle: { ...th, cpu } })}
            options={[
              { id: 1, label: t('Full speed', 'Pleine vitesse') },
              { id: 4, label: t('Mid-range phone (×4)', 'Téléphone moyen (×4)') },
              { id: 6, label: t('Low-end phone (×6)', 'Entrée de gamme (×6)') },
            ]}
          />
        </Row>
        <Row
          title={t('Analyze after each load', 'Analyser après chaque chargement')}
          hint={t('Reads the tags and runs the checks on every page load. Off: only when Page, Share or Checks is open.', 'Lit les balises et lance les checks à chaque chargement. Désactivé : seulement quand Page, Partage ou Checks est ouvert.')}
        >
          <Switch label={t('Analyze after each load', 'Analyser après chaque chargement')} on={settings.autoAnalyze} onChange={(autoAnalyze) => set({ autoAnalyze })} />
        </Row>
      </Group>

      <Group>
        <Row title={t('Guided setup', 'Accueil guidé')} hint={t('Accounts, first project and Claude, step by step.', 'Comptes, premier projet et Claude, étape par étape.')}>
          <button onClick={() => set({ onboarded: false })} className="h-8 shrink-0 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
            {t('Show again', 'Revoir')}
          </button>
        </Row>
      </Group>

      <div className="flex shrink-0 flex-col gap-2">
        <span className="label">{t('Keyboard shortcuts', 'Raccourcis clavier')}</span>
        <Group>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {SHORTCUTS().map(([keys, what]) => (
              <div key={keys} className="flex items-center justify-between gap-3 border-t border-line-soft px-3.5 py-2 text-xs text-muted">
                {what}
                <Kbd>{keys}</Kbd>
              </div>
            ))}
          </div>
        </Group>
      </div>
    </>
  );
}

const KIND = (): Record<DevicePreset['kind'], string> => ({ phone: t('Phone', 'Téléphone'), tablet: t('Tablet', 'Tablette'), desktop: t('Screen', 'Écran') });
const dprText = (n: number) => `${n.toLocaleString(t('en-US', 'fr-FR'))}×`;

/** Devices: which are shown, in which order, custom ones; one list for all or per project. */
export function DeviceSettings() {
  const state = useStore();
  const { settings, updateSettings, presets: builtins } = state;
  const all = devicePresets(state);
  const shown = activePresets(state).map((p) => p.id);
  const project = settings.projects.find((p) => p.id === settings.activeId) ?? null;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const toggle = (id: string) => {
    const on = shown.includes(id);
    if (on && shown.length === 1) return;
    void updateSettings(setActiveIds(builtins, settings, on ? shown.filter((x) => x !== id) : [...shown, id]));
  };
  const move = (id: string, to: number) => {
    const ids = all.map((p) => p.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    void updateSettings({ deviceOrder: ids });
  };
  const remove = (id: string) => {
    void updateSettings({
      customDevices: settings.customDevices.filter((d) => d.id !== id),
      deviceOrder: settings.deviceOrder.filter((x) => x !== id),
      active: settings.active.filter((x) => x !== id).length ? settings.active.filter((x) => x !== id) : settings.active,
      projects: settings.projects.map((p) => (p.active ? { ...p, active: p.active.filter((x) => x !== id) } : p)),
    });
  };
  const perProject = (on: boolean) => {
    // Start the project's list from what is shown now.
    if (on && project && !project.active?.length) void updateSettings({ devicesPerProject: true, projects: settings.projects.map((p) => (p.id === project.id ? { ...p, active: shown } : p)) });
    else void updateSettings({ devicesPerProject: on });
  };

  return (
    <>
      <Group>
      <Row
        title={t('Where the selection lives', 'Où vit la sélection')}
        hint={settings.devicesPerProject && project ? t(`Showing the list of ${project.name}.`, `Liste du projet ${project.name}.`) : t('One list for every project.', 'Une seule liste pour tous les projets.')}
      >
        <Segmented
          label={t('Where the selection lives', 'Où vit la sélection')}
          value={settings.devicesPerProject ? 'project' : 'global'}
          onChange={(v) => perProject(v === 'project')}
          options={[
            { id: 'global', label: t('Same list everywhere', 'Même liste partout') },
            { id: 'project', label: t('Per project', 'Par projet'), disabled: !project },
          ]}
        />
      </Row>
      </Group>
      <Group>
        <div className="label grid grid-cols-[20px_18px_1fr_110px_64px_84px_28px] items-center gap-3 px-3.5 py-2.5">
          <span />
          <span />
          <span>{t('Device', 'Appareil')}</span>
          <span>{t('Screen (CSS)', 'Écran (CSS)')}</span>
          <span>{t('Density', 'Densité')}</span>
          <span>Type</span>
          <span />
        </div>
        <ul aria-label={t('Devices', 'Appareils')} className="m-0 list-none p-0">
          {all.map((p, i) => {
            const on = shown.includes(p.id);
            return (
              <li
                key={p.id}
                draggable
                tabIndex={0}
                aria-label={t(`${p.label}, position ${i + 1}. Alt+arrows to move.`, `${p.label}, position ${i + 1}. Alt+flèches pour déplacer.`)}
                onDragStart={(e) => {
                  setDrag(p.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setOver(p.id);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && drag !== p.id) move(drag, all.findIndex((x) => x.id === p.id));
                  setDrag(null);
                  setOver(null);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.altKey && e.key === 'ArrowUp') move(p.id, i - 1);
                  else if (e.altKey && e.key === 'ArrowDown') move(p.id, i + 1);
                  else if (e.key === ' ') {
                    e.preventDefault();
                    toggle(p.id);
                  }
                }}
                className={`grid grid-cols-[20px_18px_1fr_110px_64px_84px_28px] items-center gap-3 border-t border-line-soft px-3.5 py-2 text-[12.5px] outline-offset-[-2px] ${drag === p.id ? 'opacity-40' : ''} ${over === p.id && drag !== p.id ? 'bg-active' : ''}`}
              >
                <Icon name="grip" size={14} className="cursor-grab text-ghost" />
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={p.label} className="size-[15px] accent-[#ededef]" />
                <span className={`flex min-w-0 items-center gap-2 ${on ? 'text-fg' : 'text-muted'}`}>
                  <span className="truncate">{p.label}</span>
                  {p.custom && <span className="shrink-0 rounded-full bg-raised px-1.5 py-px text-[10px] font-medium tracking-[0.04em] text-muted uppercase">{t('Custom', 'Perso')}</span>}
                </span>
                <span className="font-mono text-[11.5px] text-muted tabular-nums">
                  {p.width} × {p.height}
                </span>
                <span className="font-mono text-[11.5px] text-muted tabular-nums">{dprText(p.dpr)}</span>
                <span className="text-[11px] text-faint">{KIND()[p.kind]}</span>
                {p.custom ? (
                  <button onClick={() => remove(p.id)} aria-label={t(`Delete ${p.label}`, `Supprimer ${p.label}`)} title={t('Delete', 'Supprimer')} className="flex size-6 items-center justify-center rounded-md text-ghost hover:bg-active hover:text-err">
                    <Icon name="close" size={11} />
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
        <AddDevice />
      </Group>
      <p className="m-0 text-xs text-muted">
        {t(`${shown.length} device${shown.length > 1 ? 's' : ''} shown. The more there are, the smaller they get to fit the window.`, `${shown.length} appareil${shown.length > 1 ? 's' : ''} affiché${shown.length > 1 ? 's' : ''}. Plus il y en a, plus ils rapetissent pour tenir dans la fenêtre.`)}
      </p>
    </>
  );
}

function AddDevice() {
  const { settings, updateSettings, presets: builtins } = useStore();
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState('360');
  const [height, setHeight] = useState('780');
  const [dpr, setDpr] = useState('3');
  const [kind, setKind] = useState<DevicePreset['kind']>('phone');
  const [error, setError] = useState<string | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    const d = Number(dpr.replace(',', '.'));
    if (!label.trim()) return setError(t('Give the device a name.', 'Donne un nom à l’appareil.'));
    if (!(w >= 200 && w <= 4000 && h >= 200 && h <= 4000)) return setError(t('Width and height: between 200 and 4000 px.', 'Largeur et hauteur : entre 200 et 4000 px.'));
    if (!(d >= 1 && d <= 4)) return setError(t('Density: between 1 and 4.', 'Densité : entre 1 et 4.'));
    const device: CustomDevice = { id: `custom-${Date.now().toString(36)}`, label: label.trim(), width: w, height: h, dpr: d, kind };
    const next = { ...settings, customDevices: [...settings.customDevices, device] };
    const shown = useStore.getState().settings;
    void updateSettings({ customDevices: next.customDevices, ...setActiveIds(builtins, next, [...activePresets({ presets: builtins, settings: shown }).map((p) => p.id), device.id]) });
    setLabel('');
    setError(null);
  };

  const input = `${field} min-w-0 font-mono text-xs`;
  return (
    <form onSubmit={add} className="flex flex-col gap-2 border-t border-dashed border-line-strong px-3.5 py-3">
      <span className="label">{t('Add a device', 'Ajouter un appareil')}</span>
      <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.5fr_0.9fr_auto] items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
          {t('Name', 'Nom')}
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('My device', 'Mon appareil')} className={`${field} min-w-0`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
          {t('Width', 'Largeur')}
          <input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="numeric" className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
          {t('Height', 'Hauteur')}
          <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
          {t('Density', 'Densité')}
          <input value={dpr} onChange={(e) => setDpr(e.target.value)} inputMode="decimal" className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-faint">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as DevicePreset['kind'])} className={`${field} min-w-0`}>
            <option value="phone">{t('Phone', 'Téléphone')}</option>
            <option value="tablet">{t('Tablet', 'Tablette')}</option>
            <option value="desktop">{t('Screen', 'Écran')}</option>
          </select>
        </label>
        <button type="submit" className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong">
          {t('Add', 'Ajouter')}
        </button>
      </div>
      {error && <p className="m-0 text-xs text-err">{error}</p>}
      <p className="m-0 text-[11px] text-faint">{t('The user agent, touch and screen corners come from the type.', 'Le user agent, le tactile et les coins d’écran viennent du type choisi.')}</p>
    </form>
  );
}
