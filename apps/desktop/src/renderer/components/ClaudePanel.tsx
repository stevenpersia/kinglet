import { t } from '@kinglet/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import type { ClaudeCli } from '../../shared/types';
import { activeProject, patchProject } from '../../shared/projects';
import { api, claudeOpen, cleanError, projectVercel, useStore } from '../store';
import { ClaudeBanner } from './ClaudeBanner';
import { Icon } from './Icons';

const FOLD = 'M15 6l-6 6 6 6';
const WIDTH_KEY = 'kinglet.claudeWidth';
const MIN_W = 340;
const DEFAULT_W = 460;

const readWidth = () => {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    return w >= MIN_W ? w : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
};

/** Claude's column, on the right edge of the window: unfolded by default, a thin strip when folded. */
export function ClaudeColumn() {
  const open = useStore(claudeOpen);
  return open ? <ClaudePanel /> : <ClaudeStrip />;
}

/** What Claude is up to in this project, from the Claude Code hooks (when tracking is on). */
function useClaudeStatus() {
  const s = useStore();
  const id = s.settings.activeId;
  return id ? s.claude[id]?.status : undefined;
}

/** The folded column: still shows whether Claude works or waits for an answer. */
function ClaudeStrip() {
  const s = useStore();
  const status = useClaudeStatus();
  const waiting = status === 'waiting';
  const label = waiting ? t('Claude is waiting for you', 'Claude t’attend') : status === 'working' ? t('Claude is working…', 'Claude travaille…') : 'Claude';
  return (
    <button
      onClick={() => s.toggleClaude(true)}
      aria-label={t('Unfold Claude (Ctrl J)', 'Déplier Claude (Ctrl J)')}
      title={t('Unfold Claude (Ctrl J)', 'Déplier Claude (Ctrl J)')}
      className="group flex w-10 shrink-0 flex-col items-center gap-3 border-l border-line-soft bg-chrome py-3 text-faint hover:bg-active/60 hover:text-fg"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${waiting ? 'bg-warn' : 'bg-[#d97757]'} ${status === 'working' ? 'claude-dot' : ''}`} />
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d={FOLD} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[12px] [writing-mode:vertical-rl] ${waiting ? 'text-warn' : ''}`}>{label}</span>
    </button>
  );
}

/**
 * The project's terminal, running `claude`: the user's own Claude Code (login, slash commands,
 * settings). It keeps running in the main process; this view replays it and follows it.
 */
function TerminalView({ projectId, restartKey, onExit }: { projectId: string; restartKey: number; onExit: (code: number | null | undefined) => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 10000,
      smoothScrollDuration: 0,
      fastScrollModifier: 'shift',
      macOptionIsMeta: true,
      theme: {
        background: '#0e0e10',
        foreground: '#ededef',
        cursor: '#ededef',
        cursorAccent: '#0e0e10',
        selectionBackground: '#34343a',
        black: '#18181b',
        brightBlack: '#6e6e77',
        red: '#f28b82',
        brightRed: '#f6a59e',
        green: '#7dd3a8',
        brightGreen: '#9de3bf',
        yellow: '#e6c07b',
        brightYellow: '#eed29b',
        blue: '#8ab4f8',
        brightBlue: '#a8c7fa',
        magenta: '#d97757',
        brightMagenta: '#e3957b',
        cyan: '#7fd1d8',
        brightCyan: '#a0dfe4',
        white: '#a1a1aa',
        brightWhite: '#ededef',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    let alive = true;
    const off = api().onEvent((e) => {
      if (e.type !== 'term' || e.projectId !== projectId) return;
      if (e.data) term.write(e.data);
      if (e.exit !== undefined) onExit(e.exit);
    });
    const begin = restartKey ? api().term.restart(projectId, term.cols, term.rows) : api().term.start(projectId, term.cols, term.rows);
    begin.then(
      (r) => {
        if (!alive) return;
        if (r.buffer) term.write(r.buffer);
        onExit(r.running ? undefined : null);
        term.focus();
      },
      (err) => alive && term.write(`\r\n\x1b[31m${cleanError(err)}\x1b[0m\r\n`),
    );
    term.onData((d) => api().term.input(projectId, d));
    // App shortcuts step aside while typing here (Ctrl R, L, K… belong to the shell and Claude).
    const ta = el.querySelector('textarea');
    const focusOn = () => api().term.focus(true);
    const focusOff = () => api().term.focus(false);
    ta?.addEventListener('focus', focusOn);
    ta?.addEventListener('blur', focusOff);
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      fit.fit();
      api().term.resize(projectId, term.cols, term.rows);
    });
    ro.observe(el);
    return () => {
      alive = false;
      off();
      ro.disconnect();
      ta?.removeEventListener('focus', focusOn);
      ta?.removeEventListener('blur', focusOff);
      api().term.focus(false);
      term.dispose();
    };
    // onExit is a state setter from the parent: stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, restartKey]);
  // The padding sits on a wrapper: FitAddon measures the host's border-box, so padding on it
  // counted as room and declared too many columns and rows to Claude Code (broken wraps and scroll).
  return (
    <div className="flex min-h-0 flex-1 flex-col py-2 pl-3">
      <div ref={host} data-terminal={projectId} className="kinglet-term min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}

/** Claude Code in Kinglet: a terminal running `claude` in the project folder, next to the devices. */
function ClaudePanel() {
  const s = useStore();
  const project = activeProject(s.settings);
  const [cli, setCli] = useState<ClaudeCli | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [width, setWidth] = useState(readWidth);
  const [restartKey, setRestartKey] = useState(0);
  // undefined: running; null or a code: Claude Code exited.
  const [exit, setExit] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    void api().chat.cli().then(setCli);
  }, []);
  useEffect(() => {
    setExit(undefined);
    setRestartKey(0);
  }, [project?.id]);

  const close = () => s.toggleClaude(false);
  const pickFolder = async () => {
    if (!project) return;
    const r = await api().projects.pickFolder();
    if (r) await s.updateSettings(patchProject(s.settings, project.id, { folder: r.folder }));
  };
  // The repository Vercel builds this project from, to clone it when the code isn't on this computer yet.
  const repo = project ? projectVercel(s, project.id).project : null;
  const clone = async () => {
    if (!project || !repo?.gitUrl) return;
    setCloning(true);
    setCloneError(null);
    try {
      const r = await api().projects.clone(repo.gitUrl);
      if (r) await s.updateSettings(patchProject(useStore.getState().settings, project.id, { folder: r.folder }));
    } catch (e) {
      setCloneError(cleanError(e));
    }
    setCloning(false);
  };
  // Drag the left edge to make the column wider (Claude Code likes room).
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const max = Math.max(MIN_W, window.innerWidth - 420);
    const move = (ev: PointerEvent) => setWidth(Math.min(max, Math.max(MIN_W, w0 + x0 - ev.clientX)));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(WIDTH_KEY, String(Math.min(max, Math.max(MIN_W, w0 + x0 - ev.clientX))));
      } catch {
        /* not kept */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const card = 'm-4 flex flex-col gap-2.5 rounded-[10px] border border-line bg-card p-3 text-xs leading-relaxed text-muted';
  let body: React.ReactNode;
  if (!project) body = <p className="m-4 text-xs text-faint">{t('Open a project first.', 'Ouvre d’abord un projet.')}</p>;
  else if (cli && !cli.found)
    body = (
      <div className={card}>
        <span className="font-medium text-fg">{t('Claude Code isn’t installed', 'Claude Code n’est pas installé')}</span>
        {t('Kinglet runs Claude Code on this computer, with your account. Install it, then reopen this panel:', 'Kinglet fait tourner Claude Code sur cet ordinateur, avec ton compte. Installe-le, puis rouvre ce panneau :')}
        <code className="rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-fg">npm install -g @anthropic-ai/claude-code</code>
        <button onClick={() => api().openExternal('https://docs.claude.com/en/docs/claude-code/setup')} className="self-start text-fg underline-offset-2 hover:underline">
          {t('Installation guide →', 'Guide d’installation →')}
        </button>
      </div>
    );
  else if (!project.folder)
    body = (
      <div className={card}>
        <span className="font-medium text-fg">{t('Where is the code?', 'Où est le code ?')}</span>
        {t('Claude works in the project folder. Choose it once; Kinglet remembers it.', 'Claude travaille dans le dossier du projet. Choisis-le une fois, Kinglet s’en souvient.')}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => void pickFolder()} disabled={cloning} className={`h-8 rounded-ui px-3 font-semibold disabled:opacity-60 ${repo?.gitUrl ? 'border border-[#2a2a2f] bg-active text-fg hover:border-line-strong' : 'bg-fg text-bg'}`}>
            {t('Choose the folder…', 'Choisir le dossier…')}
          </button>
          {repo?.gitUrl && (
            <button onClick={() => void clone()} disabled={cloning} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60">
              {cloning ? t('Cloning…', 'Clonage…') : t(`Clone ${repo.repo ?? 'the repository'}…`, `Cloner ${repo.repo ?? 'le dépôt'}…`)}
            </button>
          )}
        </div>
        {repo?.gitUrl && !cloning && !cloneError && <span className="text-faint">{t('Not on this computer yet? Clone it: you choose where, Kinglet does the rest.', 'Pas encore sur cet ordinateur ? Clone-le : tu choisis où, Kinglet fait le reste.')}</span>}
        {cloneError && <span className="text-err">{cloneError}</span>}
      </div>
    );
  else if (!cli) body = null;
  else
    body = (
      <>
        <TerminalView key={`${project.id}:${project.folder}`} projectId={project.id} restartKey={restartKey} onExit={setExit} />
        {exit !== undefined && (
          <div className="m-3 mt-0 flex shrink-0 items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2 text-xs text-muted">
            {t('Claude Code has stopped.', 'Claude Code s’est arrêté.')}
            <button onClick={() => setRestartKey((k) => k + 1)} className="ml-auto h-7 rounded-ui bg-fg px-3 font-semibold text-bg">
              {t('Restart', 'Relancer')}
            </button>
          </div>
        )}
      </>
    );

  const ready = !!project?.folder && !!cli?.found;
  return (
    <aside aria-label="Claude" style={{ width }} className="relative flex shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft pr-2 pl-4">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-[#d97757] ${useClaudeStatus() === 'working' ? 'claude-dot' : ''}`} />
        <span className="font-medium">Claude</span>
        {project && <span className="truncate text-xs text-faint">· {project.name}</span>}
        <span className="flex-1" />
        {ready && (
          <button onClick={() => void s.startPointing()} title={t('Click a spot on a device: Claude gets the capture and the element', 'Clique un endroit d’un appareil : Claude reçoit la capture et l’élément')} className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${s.pointing ? 'border-[#d97757] text-[#d97757]' : 'border-transparent text-muted hover:bg-active hover:text-fg'}`}>
            <Icon name="target" size={12} />
            {t('Show', 'Montrer')}
          </button>
        )}
        {ready && (
          <button onClick={() => setRestartKey((k) => k + 1)} aria-label={t('Restart Claude Code', 'Relancer Claude Code')} title={t('Restart Claude Code', 'Relancer Claude Code')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="reload" size={12} />
          </button>
        )}
        <button onClick={close} aria-label={t('Fold Claude', 'Replier Claude')} title={t('Fold (Ctrl J outside the terminal)', 'Replier (Ctrl J hors du terminal)')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="rotate-180">
            <path d={FOLD} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {/* What Claude (here or in another terminal) and the build are up to. */}
      <ClaudeBanner inPanel />
      {body}
      <div role="separator" aria-orientation="vertical" aria-label={t('Resize Claude', 'Redimensionner Claude')} onPointerDown={drag} className="absolute top-0 -left-[3px] z-10 h-full w-[6px] cursor-col-resize hover:bg-line-strong/60" />
    </aside>
  );
}
