import { t } from '@kinglet/core';
import { useEffect, useRef, useState } from 'react';
import { activeProject } from '../../shared/projects';
import { api, claudeOpen, useStore } from '../store';

/** The dev server Kinglet runs for the project shown: installing, starting, or stopped on an error. */
export function DevServerScreen() {
  const s = useStore();
  const project = activeProject(s.settings);
  const dev = project ? s.dev[project.id] : undefined;
  const log = useRef<HTMLPreElement>(null);

  // Native device views stay hidden while the server isn't there.
  useEffect(() => {
    api().setPreviewsVisible(false);
    return () => api().setPreviewsVisible(useStore.getState().section === 'apercu');
  }, []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [dev?.output]);
  if (!project || !dev) return null;

  const title =
    dev.status === 'installing'
      ? t('Installing the dependencies…', 'Installation des dépendances…')
      : dev.status === 'starting'
        ? t(`Starting ${dev.command}…`, `Démarrage de ${dev.command}…`)
        : t('The dev server stopped', 'Le serveur de dev s’est arrêté');
  return (
    <main className="stage-bg flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-[720px] flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`size-2 rounded-full ${dev.status === 'error' ? 'bg-err' : 'animate-pulse bg-warn'}`} />
          <h1 className="m-0 flex-1 text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
          {dev.status === 'error' ? (
            <>
              <button onClick={() => void api().dev.stop(project.id)} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
                {t('Show the devices', 'Voir les appareils')}
              </button>
              <button onClick={() => void api().dev.start(project.id)} className="h-7 rounded-ui bg-fg px-3 text-xs font-semibold text-bg">
                {t('Start again', 'Relancer')}
              </button>
            </>
          ) : (
            <button onClick={() => void api().dev.stop(project.id)} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
              {t('Stop', 'Arrêter')}
            </button>
          )}
        </div>
        <p className="m-0 text-xs text-muted">
          {dev.status === 'error'
            ? t('Ask Claude to fix it: the output below says why.', 'Demande à Claude de corriger : la sortie ci-dessous dit pourquoi.')
            : t(`In ${project.folder ?? ''}. The site shows up on every device as soon as it answers.`, `Dans ${project.folder ?? ''}. Le site s’affiche sur tous les appareils dès qu’il répond.`)}
        </p>
        <pre ref={log} className="m-0 max-h-[50vh] min-h-[180px] overflow-auto rounded-lg border border-line bg-[#0e0e10] p-3 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-muted">
          {dev.output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') || '…'}
        </pre>
        {dev.status === 'error' && (
          <button
            onClick={() => s.askClaude(t(`The dev server (${dev.command}) fails. Find why and fix it:\n\n${dev.output.slice(-3000)}`, `Le serveur de dev (${dev.command}) échoue. Trouve pourquoi et corrige :\n\n${dev.output.slice(-3000)}`))}
            className="h-8 w-fit rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong"
          >
            {t('Ask Claude', 'Demander à Claude')}
          </button>
        )}
      </div>
    </main>
  );
}

/** Status bar: the dev server of the project shown, to start or stop it. */
export function DevServerStatus() {
  const s = useStore();
  const project = activeProject(s.settings);
  if (!project?.folder) return null;
  const dev = s.dev[project.id];
  const on = dev && (dev.status === 'installing' || dev.status === 'starting' || dev.status === 'running');
  const dot = !dev || dev.status === 'stopped' ? 'bg-ghost' : dev.status === 'running' ? 'bg-ok' : dev.status === 'error' ? 'bg-err' : 'bg-warn';
  return (
    <button
      onClick={() => void (on ? api().dev.stop(project.id) : api().dev.start(project.id))}
      title={on ? t('Stop the dev server', 'Arrêter le serveur de dev') : t('Start the dev server (installs the dependencies first if needed)', 'Lancer le serveur de dev (installe d’abord les dépendances si besoin)')}
      className="flex items-center gap-1.5 hover:text-fg"
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {on ? `${dev.command} · ${t('stop', 'arrêter')}` : t('▶ dev server', '▶ serveur de dev')}
    </button>
  );
}

/**
 * A new project with nothing to show yet: Claude sets it up. Once its package.json has a dev
 * script (and Claude isn't in the middle of a task), Kinglet starts the dev server by itself.
 */
export function NewProjectScreen() {
  const s = useStore();
  const project = activeProject(s.settings);
  const id = project?.id ?? null;
  const claude = id ? s.claude[id]?.status : undefined;
  const [ready, setReady] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    api().setPreviewsVisible(false);
    return () => api().setPreviewsVisible(useStore.getState().section === 'apercu');
  }, []);
  useEffect(() => {
    if (!id) return;
    let live = true;
    const look = async () => {
      const ok = await api().dev.canStart(id).catch(() => false);
      if (live) setReady(ok);
    };
    void look();
    const timer = setInterval(look, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    if (!id || !ready || claude === 'working' || started.current === id || s.dev[id]) return;
    started.current = id;
    void api().dev.start(id).catch(() => undefined);
  }, [id, ready, claude, s.dev]);
  if (!project) return null;

  return (
    <main className="stage-bg flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-[560px] flex-col items-center gap-3 text-center">
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{project.name}</h1>
        <p className="m-0 text-[13px] leading-[1.55] text-muted">
          {ready
            ? t('The project has a dev script: Kinglet starts it as soon as Claude has finished its task.', 'Le projet a un script dev : Kinglet le lance dès que Claude a fini sa tâche.')
            : t('Choose the stack with Claude, in the column on the left. As soon as the project has a dev script in package.json, Kinglet starts it and shows the site on every device.', 'Choisis la stack avec Claude, dans la colonne de gauche. Dès que le projet a un script dev dans package.json, Kinglet le lance et affiche le site sur tous les appareils.')}
        </p>
        <span className="font-mono text-[11.5px] text-faint">{project.folder?.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~')}</span>
        <div className="flex gap-2 pt-1">
          <button disabled={!ready} onClick={() => void api().dev.start(project.id)} className="h-8 rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-40">
            {t('Start the dev server', 'Lancer le serveur de dev')}
          </button>
          {!claudeOpen(s) && (
            <button onClick={() => s.toggleClaude(true)} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
              {t('Show Claude', 'Afficher Claude')}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
