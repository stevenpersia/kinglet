import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, VercelTeamProject } from '../../shared/types';
import { timeAgo } from '../lib/env';
import { projectStatus } from '../lib/status';
import { projectVercel, useStore } from '../store';
import { Kbd } from './Icons';
import { ProjectBadge, StatusDot } from './TitleBar';

type Row =
  | { kind: 'open'; key: string; project: Project; index: number }
  | { kind: 'vercel'; key: string; vp: VercelTeamProject; known: Project | null }
  | { kind: 'address'; key: string; url: string };

const looksLikeAddress = (q: string) => /^(https?:\/\/|localhost|127\.|\d{2,5}$|[\w-]+\.[a-z]{2,}(\/|$))/i.test(q.trim());
const toUrl = (q: string) => {
  const v = q.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\d+$/.test(v)) return `http://localhost:${v}/`;
  return (/^(localhost|127\.)/.test(v) ? 'http://' : 'https://') + v;
};
const host = (u: string | null) => {
  try {
    return u ? new URL(u).host : null;
  } catch {
    return null;
  }
};
const home = (p: string | null) => p?.replace(/^\/home\/[^/]+/, '~') ?? null;

/** Ctrl+P: jump to an open project, open another Vercel project, or open an address. */
export function ProjectSwitcher() {
  const s = useStore();
  const { switcherOpen, settings, vercel, claude, openOverlay, closeOverlay } = s;
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState<string | null | 'all'>('all');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    void openOverlay();
    setQuery('');
    setIndex(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => closeOverlay();
  }, [switcherOpen, openOverlay, closeOverlay]);

  const close = () => useStore.setState({ switcherOpen: false });

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (...texts: (string | null | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));
    const open = settings.openIds
      .map((id, index) => ({ project: settings.projects.find((p) => p.id === id), index }))
      .filter((x): x is { project: Project; index: number } => !!x.project && match(x.project.name, x.project.localOrigin, x.project.folder))
      .map(({ project, index }): Row => ({ kind: 'open', key: `o-${project.id}`, project, index }));
    const openVercel = new Set(settings.openIds.map((id) => settings.projects.find((p) => p.id === id)?.vercelProjectId).filter(Boolean));
    const others = (vercel?.projects ?? [])
      .filter((vp) => !openVercel.has(vp.id) && (team === 'all' || vp.teamId === team) && match(vp.name, vp.productionUrl, vp.repo))
      .map((vp): Row => ({ kind: 'vercel', key: `v-${vp.id}`, vp, known: settings.projects.find((p) => p.vercelProjectId === vp.id) ?? null }));
    // Recently closed projects that are not on Vercel (local sites).
    const closedLocal = settings.projects
      .filter((p) => !p.vercelProjectId && !settings.openIds.includes(p.id) && match(p.name, p.localOrigin, p.folder))
      .map((project): Row => ({ kind: 'open', key: `c-${project.id}`, project, index: -1 }));
    const address: Row[] = q && looksLikeAddress(q) ? [{ kind: 'address', key: 'addr', url: toUrl(query) }] : [];
    return [...address, ...open, ...others, ...closedLocal];
  }, [query, team, settings, vercel]);

  const selected = Math.min(index, Math.max(0, rows.length - 1));
  useEffect(() => {
    list.current?.querySelector(`[data-i="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!switcherOpen) return null;

  const run = (row: Row | undefined) => {
    if (!row) return;
    close();
    if (row.kind === 'open') void s.selectProject(row.project.id);
    else if (row.kind === 'vercel') void s.openVercelProject(row.vp);
    else void s.openAddress(row.url);
  };

  const teams = vercel?.connected ? [{ id: null as string | null, name: 'Personnel' }, ...vercel.teams.map((t) => ({ id: t.id as string | null, name: t.name }))] : [];
  const sectionStart = (i: number) => {
    const r = rows[i]!;
    const prev = rows[i - 1];
    const label = (x: Row) => (x.kind === 'address' ? 'Adresse' : x.kind === 'vercel' ? 'vercel' : x.key.startsWith('o-') ? 'open' : 'closed');
    if (prev && label(prev) === label(r)) return null;
    const teamName = team === 'all' ? null : teams.find((t) => t.id === team)?.name;
    return { Adresse: 'Ouvrir une adresse', open: 'Ouverts', vercel: `Autres projets Vercel${teamName ? ` · ${teamName}` : ''}`, closed: 'Sites locaux' }[label(r)];
  };

  const row = (r: Row, i: number) => {
    const on = i === selected;
    const base = `flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left ${on ? 'bg-raised shadow-[inset_0_0_0_1px_#2e2e33]' : ''}`;
    if (r.kind === 'address')
      return (
        <div className={base}>
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-raised text-faint shadow-[inset_0_0_0_1px_#2a2a2f]">↗</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.url}</span>
          <span className="text-[11.5px] text-faint">nouvel onglet</span>
        </div>
      );
    if (r.kind === 'open') {
      const st = projectStatus(claude[r.project.id], projectVercel(s, r.project.id).deployments);
      const pv = projectVercel(s, r.project.id).project;
      const detail = [st.detail, r.project.localOrigin ? `local ${host(r.project.localOrigin)}` : null, host(pv?.productionUrl ?? null)].filter(Boolean).join(' · ');
      return (
        <div className={base}>
          <ProjectBadge name={r.project.name} size={22} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium text-fg">{r.project.name}</span>
            <span className="truncate text-[11.5px] text-faint">{detail || home(r.project.folder) || 'Aucun environnement connu'}</span>
          </span>
          {st.kind !== 'idle' && (
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]" style={{ color: st.color }}>
              <StatusDot kind={st.kind} color={st.color} />
              {st.kind === 'working' ? `Claude · ${st.short}` : st.short}
            </span>
          )}
          {r.index >= 0 && r.index < 9 && <Kbd>{`Ctrl ${r.index + 1}`}</Kbd>}
        </div>
      );
    }
    const latest = vercel?.deployments[r.vp.id]?.[0];
    return (
      <div className={base}>
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-raised text-[10px] font-semibold text-muted shadow-[inset_0_0_0_1px_#2a2a2f]">{r.vp.name.slice(0, 2).toUpperCase()}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-fg">{r.vp.name}</span>
          <span className="truncate text-[11.5px] text-faint">{[r.vp.framework, host(r.vp.productionUrl), latest ? `déployé ${timeAgo(latest.createdAt)}` : null].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={`shrink-0 text-[11.5px] whitespace-nowrap ${r.known?.folder ? 'text-faint' : 'text-ghost'}`}>{home(r.known?.folder ?? null) ?? r.vp.repo ?? ''}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/55 pt-[52px]" onMouseDown={close}>
      <div role="dialog" aria-label="Projets" className="flex h-fit max-h-[calc(100vh-104px)] w-[660px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line-soft px-3.5">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="text-faint"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
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
                setIndex((i) => Math.min(i + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') run(rows[selected]);
            }}
            aria-label="Rechercher un projet"
            placeholder={vercel?.connected ? 'Rechercher un projet Vercel, ou taper une adresse…' : 'localhost:3000, 5173 ou https://…'}
            className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-ghost"
          />
          {teams.length > 1 && (
            <span role="group" aria-label="Équipe" className="flex gap-1">
              {[{ id: 'all' as const, name: 'Tous' }, ...teams].map((t) => (
                <button
                  key={String(t.id)}
                  aria-pressed={team === t.id}
                  onClick={() => {
                    setTeam(t.id);
                    setIndex(0);
                    input.current?.focus();
                  }}
                  className={`h-6 rounded-md px-2 text-xs whitespace-nowrap ${team === t.id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`}
                >
                  {t.name}
                </button>
              ))}
            </span>
          )}
        </div>
        <div ref={list} role="listbox" className="min-h-0 overflow-y-auto p-1.5">
          {rows.map((r, i) => {
            const title = sectionStart(i);
            return (
              <div key={r.key}>
                {title && <div className={`label px-2.5 pb-1.5 ${i ? 'pt-3.5' : 'pt-2'}`}>{title}</div>}
                <div role="option" aria-selected={i === selected} data-i={i} onMouseMove={() => setIndex(i)} onClick={() => run(r)}>
                  {row(r, i)}
                </div>
              </div>
            );
          })}
          {!rows.length && <p className="px-2.5 py-3 text-faint">{query ? 'Aucun projet trouvé. Tape une adresse (localhost:3000…) pour l’ouvrir.' : 'Aucun projet.'}</p>}
          {!vercel?.connected && (
            <p className="mx-2.5 mt-2 mb-1 text-xs leading-5 text-faint">
              Connecte Vercel dans les{' '}
              <button
                className="text-fg underline-offset-2 hover:underline"
                onClick={() => {
                  close();
                  s.setSection('reglages');
                }}
              >
                réglages
              </button>{' '}
              pour retrouver ici tous tes projets.
            </p>
          )}
        </div>
        <div className="flex h-[38px] shrink-0 items-center gap-4 border-t border-line-soft bg-[#0e0e10] px-3.5 text-[11.5px] text-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>Entrée</Kbd> ouvrir dans un onglet
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl 1…9</Kbd> aller à l’onglet
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Ctrl P</Kbd> depuis n’importe où
          </span>
        </div>
      </div>
    </div>
  );
}
