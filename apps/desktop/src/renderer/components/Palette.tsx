import { t } from '@kinglet/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { activePresets, api, devicePresets, projectVercel, useStore, type Section } from '../store';
import { setActiveIds } from '../../shared/devices';
import { Icon, Kbd } from './Icons';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run(): void;
}

/** Ctrl+K command palette. Native previews are frozen as images while it is open. */
export function Palette() {
  const st = useStore();
  const { paletteOpen, presets, settings, updateSettings, setSection, openOverlay, closeOverlay, switchEnv } = st;
  const linked = !!projectVercel(st).project;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    void openOverlay();
    setQuery('');
    setIndex(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => closeOverlay();
  }, [paletteOpen, openOverlay, closeOverlay]);

  const close = () => useStore.setState({ paletteOpen: false });

  const commands = useMemo<Command[]>(() => {
    const go = (s: Section, label: string): Command => ({ id: `go-${s}`, label: t(`Go to ${label}`, `Aller à ${label}`), run: () => setSection(s) });
    return [
      { id: 'reload', label: t('Reload devices', 'Recharger les appareils'), hint: 'Ctrl R', run: () => void api().reload() },
      { id: 'phone', label: t('Open on my phone (QR code)', 'Ouvrir sur mon téléphone (QR code)'), run: () => useStore.setState({ phoneOpen: true }) },
      { id: 'url', label: t('Change address', 'Changer d’adresse'), hint: 'Ctrl L', run: () => useStore.setState((s) => ({ urlFocusTick: s.urlFocusTick + 1 })) },
      { id: 'landscape', label: settings.landscape ? t('Switch to portrait', 'Passer en portrait') : t('Switch to landscape', 'Passer en paysage'), hint: t('Ctrl Shift O', 'Ctrl Maj O'), run: () => void updateSettings({ landscape: !settings.landscape }) },
      { id: 'sync', label: settings.scrollSync ? t('Turn off scroll sync', 'Désactiver la synchro') : t('Turn on scroll sync', 'Activer la synchro'), hint: t('Ctrl Shift S', 'Ctrl Maj S'), run: () => void updateSettings({ scrollSync: !settings.scrollSync }) },
      ...devicePresets(st).map((p) => {
        const active = activePresets(st).map((x) => x.id);
        const on = active.includes(p.id);
        return {
          id: `device-${p.id}`,
          label: `${on ? t('Remove', 'Retirer') : t('Add', 'Ajouter')} ${p.label}`,
          hint: `${p.width} px`,
          run: () => {
            const next = on ? active.filter((x) => x !== p.id) : [...active, p.id];
            if (next.length) void updateSettings(setActiveIds(presets, settings, next));
          },
        };
      }),
      ...(linked
        ? [
            { id: 'env-local', label: t('View this page locally', 'Voir cette page en local'), run: () => void switchEnv('local') },
            { id: 'env-preview', label: t('View this page on the latest preview', 'Voir cette page sur la dernière preview'), run: () => void switchEnv('preview') },
            { id: 'env-prod', label: t('View this page in production', 'Voir cette page en production'), run: () => void switchEnv('prod') },
          ]
        : []),
      { id: 'switcher', label: t('Switch project…', 'Changer de projet…'), hint: 'Ctrl P', run: () => useStore.setState({ switcherOpen: true }) },
      ...settings.openIds.map((id, i) => {
        const p = settings.projects.find((x) => x.id === id);
        return { id: `tab-${id}`, label: t(`Go to project ${p?.name ?? id}`, `Aller au projet ${p?.name ?? id}`), hint: i < 9 ? `Ctrl ${i + 1}` : undefined, run: () => void useStore.getState().selectProject(id) };
      }),
      go('projets', t('all projects', 'tous les projets')),
      go('apercu', t('Devices', 'l’aperçu')),
      go('deploiements', t('Deployments', 'Déploiements')),
      go('comparer', t('Compare', 'Comparer')),
      go('partage', t('Share', 'Partage')),
      { id: 'console', label: t('Show or hide the console', 'Afficher ou masquer la console'), run: () => useStore.getState().toggleConsole() },
      { id: 'panel-page', label: t('Show or hide the Page panel', 'Afficher ou masquer le panneau Page'), run: () => useStore.getState().togglePanel('page') },
      { id: 'panel-checks', label: t('Show or hide the Checks panel', 'Afficher ou masquer le panneau Checks'), run: () => useStore.getState().togglePanel('checks') },
      go('reglages', t('Settings', 'Réglages')),
      ...settings.recentUrls.map((u) => ({ id: `open-${u}`, label: t(`Open ${u}`, `Ouvrir ${u}`), run: () => void useStore.getState().navigate(u) })),
    ];
  }, [presets, settings, updateSettings, setSection, linked, switchEnv]);

  const q = query.trim().toLowerCase();
  const results = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  const selected = Math.min(index, Math.max(0, results.length - 1));

  if (!paletteOpen) return null;
  const runAt = (i: number) => {
    const c = results[i];
    close();
    c?.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[14vh]" onMouseDown={close}>
      <div role="dialog" aria-label={t('Commands', 'Commandes')} className="h-fit w-[560px] overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line-soft px-3.5">
          <Icon name="search" size={15} className="text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') runAt(selected);
            }}
            aria-label={t('Search commands', 'Rechercher une commande')}
            placeholder={t('Search commands, devices, sites…', 'Rechercher une commande, un appareil, un site…')}
            className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-ghost"
          />
          <Kbd>{t('Esc', 'Échap')}</Kbd>
        </div>
        <ul role="listbox" className="max-h-[360px] overflow-y-auto p-1">
          {results.length === 0 && <li className="px-3 py-2.5 text-faint">{t('No results.', 'Aucun résultat.')}</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setIndex(i)}
              onClick={() => runAt(i)}
              className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 ${i === selected ? 'bg-active text-fg' : 'text-muted'}`}
            >
              <span className="truncate">{c.label}</span>
              {c.hint && <span className="ml-3 shrink-0 font-mono text-[11px] text-ghost">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
