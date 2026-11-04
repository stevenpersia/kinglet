import { useEffect, useMemo, useRef, useState } from 'react';
import { api, projectVercel, useStore, type Section } from '../store';
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
    const go = (s: Section, label: string): Command => ({ id: `go-${s}`, label: `Aller à ${label}`, run: () => setSection(s) });
    return [
      { id: 'reload', label: 'Recharger les appareils', hint: 'Ctrl R', run: () => void api().reload() },
      { id: 'phone', label: 'Ouvrir sur mon téléphone (QR code)', run: () => useStore.setState({ phoneOpen: true }) },
      { id: 'url', label: 'Changer d’adresse', hint: 'Ctrl L', run: () => useStore.setState((s) => ({ urlFocusTick: s.urlFocusTick + 1 })) },
      { id: 'landscape', label: settings.landscape ? 'Passer en portrait' : 'Passer en paysage', hint: 'Ctrl Maj O', run: () => void updateSettings({ landscape: !settings.landscape }) },
      { id: 'sync', label: settings.scrollSync ? 'Désactiver la synchro' : 'Activer la synchro', hint: 'Ctrl Maj S', run: () => void updateSettings({ scrollSync: !settings.scrollSync }) },
      ...presets.map((p) => {
        const on = settings.active.includes(p.id);
        return {
          id: `device-${p.id}`,
          label: `${on ? 'Retirer' : 'Ajouter'} ${p.label}`,
          hint: `${p.width} px`,
          run: () => {
            const next = on ? settings.active.filter((x) => x !== p.id) : [...settings.active, p.id];
            if (next.length) void updateSettings({ active: presets.filter((x) => next.includes(x.id)).map((x) => x.id) });
          },
        };
      }),
      ...(linked
        ? [
            { id: 'env-local', label: 'Voir cette page en local', run: () => void switchEnv('local') },
            { id: 'env-preview', label: 'Voir cette page sur la dernière preview', run: () => void switchEnv('preview') },
            { id: 'env-prod', label: 'Voir cette page en production', run: () => void switchEnv('prod') },
          ]
        : []),
      { id: 'switcher', label: 'Changer de projet…', hint: 'Ctrl P', run: () => useStore.setState({ switcherOpen: true }) },
      ...settings.openIds.map((id, i) => {
        const p = settings.projects.find((x) => x.id === id);
        return { id: `tab-${id}`, label: `Aller au projet ${p?.name ?? id}`, hint: i < 9 ? `Ctrl ${i + 1}` : undefined, run: () => void useStore.getState().selectProject(id) };
      }),
      go('projets', 'tous les projets'),
      go('apercu', 'l’aperçu'),
      go('deploiements', 'Déploiements'),
      go('comparer', 'Comparer'),
      go('partage', 'Partage'),
      go('reglages', 'Réglages'),
      ...settings.recentUrls.map((u) => ({ id: `open-${u}`, label: `Ouvrir ${u}`, run: () => void useStore.getState().navigate(u) })),
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
      <div role="dialog" aria-label="Commandes" className="h-fit w-[560px] overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
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
            aria-label="Rechercher une commande"
            placeholder="Rechercher une commande, un appareil, un site…"
            className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-ghost"
          />
          <Kbd>Échap</Kbd>
        </div>
        <ul role="listbox" className="max-h-[360px] overflow-y-auto p-1">
          {results.length === 0 && <li className="px-3 py-2.5 text-faint">Aucun résultat.</li>}
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
