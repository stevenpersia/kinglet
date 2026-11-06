import { useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '@kinglet/core';
import type { Project } from '../../shared/types';
import { ENV_DOT, envOf } from '../lib/env';
import { initials, projectColor, projectStatus } from '../lib/status';
import { useNow } from '../lib/useNow';
import { api, projectVercel, useStore } from '../store';
import { EnvSwitch } from './EnvSwitch';
import { Dot, Icon, Kbd, Mark } from './Icons';

const statusLabel = () => ({ idle: '', loading: t('loading…', 'chargement…'), loaded: t('loaded', 'chargé'), failed: t('unreachable', 'injoignable') }) as const;

function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\d+$/.test(v)) return `http://localhost:${v}/`; // "3000" → localhost:3000
  return (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(v) ? 'http://' : 'https://') + v;
}

/** Initials on the project's colour. */
export function ProjectBadge({ name, favicon, size = 18 }: { name: string; favicon?: string | null; size?: number }) {
  if (favicon) return <img src={favicon} alt="" aria-hidden="true" draggable={false} className="shrink-0 rounded-[4px] object-contain" style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[5px] font-semibold text-white"
      style={{ width: size, height: size, background: projectColor(name), fontSize: Math.round(size * 0.52) }}
    >
      {initials(name)}
    </span>
  );
}

/** Pulsing clay dot while Claude works, plain dot otherwise. */
export function StatusDot({ kind, color, size = 7 }: { kind: string; color: string; size?: number }) {
  if (kind === 'idle') return null;
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${kind === 'working' ? 'claude-dot' : ''}`} style={{ width: size, height: size, background: color }} />;
}

function Tab({ project, index }: { project: Project; index: number }) {
  const s = useStore();
  const now = useNow();
  const on = s.settings.activeId === project.id;
  const st = projectStatus(s.claude[project.id], projectVercel(s, project.id).deployments, now);
  return (
    <div
      role="tab"
      aria-selected={on}
      title={`${project.name} · ${st.label}${st.detail ? `\n${st.detail}` : ''}`}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          void s.closeProject(project.id);
        }
      }}
      className={`group no-drag relative flex max-w-[236px] min-w-[120px] flex-1 items-center gap-2 border-r border-line-soft pr-1.5 pl-3 text-[12.5px] ${on ? 'bg-raised text-fg' : 'text-faint hover:bg-active hover:text-muted'}`}
    >
      <button onClick={() => void s.selectProject(project.id)} className="absolute inset-0" aria-label={`${project.name}, ${st.label}`} />
      <ProjectBadge name={project.name} favicon={project.favicon} />
      <span className="pointer-events-none min-w-0 flex-1 truncate">{project.name}</span>
      {st.kind !== 'idle' && (
        <span className="pointer-events-none flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: st.color }}>
          <StatusDot kind={st.kind} color={st.color} />
          <span className="hidden font-mono lg:inline">{st.short}</span>
        </span>
      )}
      {index < 9 && <span className="pointer-events-none hidden font-mono text-[10px] text-[#4a4a52] group-hover:hidden xl:inline">^{index + 1}</span>}
      <button
        onClick={() => void s.closeProject(project.id)}
        aria-label={t(`Close ${project.name}`, `Fermer ${project.name}`)}
        title={t('Close tab', 'Fermer l’onglet')}
        className={`relative z-10 flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-raised hover:text-fg ${on ? '' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  );
}

function WindowControls() {
  const maximized = useStore((s) => s.maximized);
  return (
    <div data-window-controls className="no-drag flex h-full shrink-0">
      <button aria-label={t('Minimize', 'Réduire')} onClick={() => api().windowControl('minimize')} className="flex h-full w-[44px] items-center justify-center text-muted hover:bg-active hover:text-fg">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button aria-label={maximized ? t('Restore', 'Restaurer') : t('Maximize', 'Agrandir')} onClick={() => api().windowControl('maximize')} className="flex h-full w-[44px] items-center justify-center text-muted hover:bg-active hover:text-fg">
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5h5.5V7M1.5 3h5.5v5.5H1.5z" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
        )}
      </button>
      <button aria-label={t('Close', 'Fermer')} onClick={() => api().windowControl('close')} className="flex h-full w-[44px] items-center justify-center text-muted hover:bg-[#c42b1c] hover:text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
    </div>
  );
}

/** Row 1: one tab per open project, with what Claude / Vercel is doing on it. */
function ProjectTabs() {
  const s = useStore();
  const open = s.settings.openIds.map((id) => s.settings.projects.find((p) => p.id === id)).filter((p): p is Project => !!p);
  const working = Object.entries(s.claude).filter(([id, c]) => id && c.status === 'working').length;
  const overview = s.section === 'projets';
  return (
    <div role="tablist" aria-label={t('Open projects', 'Projets ouverts')} className="drag flex h-[42px] shrink-0 items-stretch border-b border-line-soft bg-chrome">
      <span className="flex w-14 shrink-0 items-center justify-center border-r border-line-soft">
        <Mark />
      </span>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {open.map((p, i) => (
          <Tab key={p.id} project={p} index={i} />
        ))}
        <button
          onClick={() => useStore.setState({ switcherOpen: true })}
          aria-label={t('Open a project (Ctrl P)', 'Ouvrir un projet (Ctrl P)')}
          title={t('Open a project (Ctrl P)', 'Ouvrir un projet (Ctrl P)')}
          className="no-drag flex w-[42px] shrink-0 items-center justify-center border-r border-line-soft text-lg leading-none text-faint hover:bg-active hover:text-fg"
        >
          +
        </button>
        {!open.length && <span className="ml-3 self-center text-xs text-ghost">{t('Open a Vercel project or a local address', 'Ouvre un projet Vercel ou une adresse locale')}</span>}
      </div>
      <button
        onClick={() => s.setSection(overview ? 'apercu' : 'projets')}
        aria-pressed={overview}
        title={t('All projects (Ctrl Shift A)', 'Tous les projets (Ctrl Maj A)')}
        className={`no-drag flex shrink-0 items-center gap-2 border-x border-line-soft px-3.5 text-xs whitespace-nowrap ${overview ? 'bg-card text-fg shadow-[inset_0_1px_0_#ededef]' : 'text-muted hover:bg-active hover:text-fg'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
        <span className="hidden lg:inline">{t('All projects', 'Tous les projets')}</span>
        {working > 0 && (
          <span className="flex items-center gap-1" title={t(`Claude is working on ${working} project${working > 1 ? 's' : ''}`, `Claude travaille sur ${working} projet${working > 1 ? 's' : ''}`)}>
            <span className="claude-dot size-1.5 rounded-full bg-[#d97757]" />
            <span className="font-mono text-[11px]">{working}</span>
          </span>
        )}
      </button>
      <WindowControls />
    </div>
  );
}

/** "Pages" menu at the end of the address bar: the pages found by crawling the site. */
function PagesMenu() {
  const { url, pages, crawling, crawlSite, navigate, openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  let current: URL | null = null;
  try {
    current = url ? new URL(url) : null;
  } catch {
    /* no page */
  }
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const list = pages.length ? pages : current ? [{ url: current.toString(), path: current.pathname, status: null, title: null }] : [];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11.5px] whitespace-nowrap text-faint hover:bg-active hover:text-fg disabled:opacity-50"
      >
        Pages{pages.length ? <span className="font-mono text-[10.5px] text-ghost">{pages.length}</span> : null}
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" fill="none" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-8 right-0 z-50 flex max-h-[60vh] w-80 flex-col rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
              <span className="label">{t('Site pages', 'Pages du site')}{pages.length ? ` · ${pages.length}` : ''}</span>
              <button onClick={() => void crawlSite(true)} disabled={crawling} title={t('Crawl the site again', 'Explorer à nouveau le site')} aria-label={t('Crawl the site again', 'Explorer à nouveau le site')} className="rounded p-0.5 text-ghost hover:bg-active hover:text-fg disabled:opacity-50">
                <Icon name="reload" size={12} className={crawling ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto">
              {list.map((p) => {
                const on = current?.pathname === p.path;
                const dot = p.status == null ? 'bg-ghost' : p.status < 300 ? 'bg-ok' : p.status < 400 ? 'bg-warn' : 'bg-err';
                return (
                  <button
                    key={p.url}
                    role="menuitem"
                    onClick={() => {
                      void toggle();
                      if (current) void navigate(new URL(p.path, current.origin).toString());
                    }}
                    title={p.title ?? p.path}
                    className={`flex h-7 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left font-mono text-xs ${on ? 'bg-active text-fg' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
                  >
                    <span className="truncate">{p.path}</span>
                    {p.status != null && p.status >= 300 ? <span className="shrink-0 text-[10.5px] text-err">{p.status}</span> : <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />}
                  </button>
                );
              })}
              {crawling && <p className="mx-2.5 my-1.5 text-[11.5px] text-faint">{t('Crawling the site…', 'Exploration du site…')}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Row 2: the active project's environment, address, and actions. */
function ProjectToolbar() {
  const s = useStore();
  const { url, status, detectedFrom, navigate, urlFocusTick, phone } = s;
  const env = envOf(url, projectVercel(s));
  const [draft, setDraft] = useState(url ?? '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(url ?? ''), [url]);
  useEffect(() => {
    if (urlFocusTick) input.current?.select();
  }, [urlFocusTick]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeUrl(draft);
    if (!next) return;
    // No project open yet: an address opens one.
    if (!s.settings.activeId) void s.openAddress(next);
    else void navigate(next);
    input.current?.blur();
  };

  return (
    <div data-toolbar className="drag flex h-[46px] shrink-0 items-center gap-2.5 border-b border-line-soft bg-card px-3">
      <EnvSwitch />
      <form onSubmit={submit} className="no-drag flex h-[30px] min-w-[150px] flex-1 items-center gap-2 rounded-ui border border-line bg-bg pr-1 pl-2.5 focus-within:border-line-strong">
        <Dot className={env ? ENV_DOT[env] : 'bg-ghost'} />
        <label htmlFor="url" className="sr-only">
          {t('Address', 'Adresse')}
        </label>
        <input
          id="url"
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('localhost:3000, 5173 or https://…', 'localhost:3000, 5173 ou https://…')}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none placeholder:text-ghost"
        />
        <span className="hidden text-[11.5px] whitespace-nowrap text-faint lg:inline">{status === 'loaded' && detectedFrom ? detectedFrom : statusLabel()[status]}</span>
        <PagesMenu />
      </form>

      <button onClick={() => void api().reload()} aria-label={t('Reload (Ctrl+R)', 'Recharger (Ctrl+R)')} title={t('Reload (Ctrl+R)', 'Recharger (Ctrl+R)')} className="no-drag flex size-7 shrink-0 items-center justify-center rounded-ui border border-line text-muted hover:border-line-strong hover:text-fg">
        <Icon name="reload" size={13} />
      </button>
      <button
        onClick={() => useStore.setState({ phoneOpen: true })}
        title={t('Open this page on your phone', 'Ouvrir cette page sur ton téléphone')}
        aria-label={t('On my phone', 'Sur mon téléphone')}
        className="no-drag flex h-7 shrink-0 items-center gap-2 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-muted hover:border-line-strong hover:text-fg 2xl:px-2.5"
      >
        <Icon name="phone" size={13} />
        <span className="hidden 2xl:inline">{t('Phone', 'Téléphone')}</span>
        {!!phone?.clients.length && <span className="size-1.5 rounded-full bg-ok" aria-label={t('phone connected', 'téléphone connecté')} />}
      </button>
      <button
        onClick={() => useStore.setState({ paletteOpen: true })}
        aria-label={t('Search (Ctrl K)', 'Rechercher (Ctrl K)')}
        title={t('Search (Ctrl K)', 'Rechercher (Ctrl K)')}
        className="no-drag flex h-7 shrink-0 items-center gap-2.5 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-faint hover:border-line-strong 2xl:pr-2 2xl:pl-2.5"
      >
        <Icon name="search" size={13} className="2xl:hidden" />
        <span className="hidden 2xl:inline">{t('Search', 'Rechercher')}</span>
        <span className="hidden 2xl:inline">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>
    </div>
  );
}

export function TitleBar() {
  const overview = useStore((s) => s.section === 'projets');
  return (
    <header className="flex shrink-0 flex-col">
      <ProjectTabs />
      {!overview && <ProjectToolbar />}
    </header>
  );
}
