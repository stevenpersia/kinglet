import { locale, t } from '@kinglet/core';
import { useEffect } from 'react';
import type { ClaudeEvent, Project } from '../../shared/types';
import { ENV_DOT, envOf, timeAgo } from '../lib/env';
import { projectStatus, type ProjectStatus } from '../lib/status';
import { useNow } from '../lib/useNow';
import { api, projectVercel, useStore } from '../store';
import { Dot } from './Icons';
import { ProjectBadge, StatusDot } from './TitleBar';

const btn = (primary = false) =>
  `inline-flex h-7 items-center rounded-ui px-3 text-xs whitespace-nowrap ${primary ? 'bg-fg font-semibold text-bg' : 'border border-[#2a2a2f] font-medium text-fg hover:border-line-strong'}`;

const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).host + new URL(u).pathname : null;
  } catch {
    return null;
  }
};

/** Prompt to paste in Claude Code when a Vercel build fails. */
const buildErrorPrompt = (name: string, branch: string | null, inspector: string | null) =>
  t(
    `The Vercel build of project ${name}${branch ? ` (branch ${branch})` : ''} failed.${inspector ? ` Log: ${inspector}` : ''} Run the build locally (pnpm build or npm run build), find the error and fix it.`,
    `Le build Vercel du projet ${name}${branch ? ` (branche ${branch})` : ''} a échoué.${inspector ? ` Log : ${inspector}` : ''} Lance le build en local (pnpm build ou npm run build), trouve l’erreur et corrige-la.`,
  );

function Card({ project, index, st }: { project: Project; index: number; st: ProjectStatus }) {
  const s = useStore();
  const { project: vp, deployments } = projectVercel(s, project.id);
  const latest = deployments[0];
  const active = s.settings.activeId === project.id;
  const shown = active ? s.url : project.lastUrl;
  const env = envOf(shown, { project: vp, deployments });
  const thumb = s.thumbs[project.id];
  const claude = s.claude[project.id];
  const open = () => {
    void s.selectProject(project.id);
    s.setSection('apercu');
  };
  const seen = () => api().claude.markSeen(project.id);

  const tint = { working: 'rgba(217,119,87,0.09)', waiting: 'rgba(230,192,123,0.08)', review: 'rgba(237,237,239,0.05)', error: 'rgba(242,139,130,0.08)', building: 'rgba(230,192,123,0.06)', idle: 'transparent' }[st.kind];
  const idleDetail = claude?.prompt
    ? t(`Last request ${timeAgo(claude.lastAt)}: “${claude.prompt}”`, `Dernière demande ${timeAgo(claude.lastAt)} : « ${claude.prompt} »`)
    : project.folder
      ? t('No Claude Code session tracked yet.', 'Aucune session Claude Code suivie pour l’instant.')
      : t('Choose the project folder to track Claude Code.', 'Choisis le dossier du projet pour suivre Claude Code.');

  return (
    <article className={`flex gap-4 rounded-xl border bg-card p-4 ${st.kind === 'working' ? 'border-[rgba(217,119,87,0.45)]' : 'border-line'}`}>
      <button onClick={open} aria-label={t(`Open ${project.name}`, `Ouvrir ${project.name}`)} className="h-[236px] w-[118px] shrink-0 rounded-[18px] bg-black p-[3px] shadow-[0_0_0_1px_#2e2e33]">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full rounded-[15px] object-cover object-top" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-[15px] bg-active text-[11px] text-ghost">{active ? t('loading…', 'chargement…') : t('not seen yet', 'pas encore vu')}</span>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <ProjectBadge name={project.name} favicon={project.favicon} size={22} />
          <h2 className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">{project.name}</h2>
          {index < 9 && <span className="font-mono text-[11px] text-faint">Ctrl {index + 1}</span>}
        </div>
        <div className="flex items-start gap-2.5 rounded-lg px-2.5 py-2" style={{ background: tint }}>
          <span className="mt-[5px]">{st.kind === 'idle' ? <Dot className="bg-ghost" /> : <StatusDot kind={st.kind} color={st.color} size={8} />}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">{st.label}</span>
            <span className="line-clamp-2 text-xs leading-[1.4] text-muted">{st.kind === 'idle' ? idleDetail : (st.detail ?? '')}</span>
          </span>
        </div>
        <dl className="m-0 flex flex-col gap-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 text-faint">{t('Showing', 'Affiché')}</dt>
            <dd className="m-0 flex min-w-0 items-center gap-1.5">
              <Dot className={env ? ENV_DOT[env] : 'bg-ghost'} />
              <span className="truncate font-mono text-[11.5px]">{host(shown) ?? '—'}</span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 text-faint">{t('Deployment', 'Déploiement')}</dt>
            <dd className={`m-0 truncate ${latest?.state === 'ERROR' ? 'text-err' : ''}`}>
              {!vp ? <span className="text-ghost">{t('not linked to Vercel', 'pas relié à Vercel')}</span> : latest ? `${latest.production ? 'Prod' : 'Preview'} ${latest.state === 'READY' ? t('ready', 'prête') : latest.state === 'ERROR' ? t('failed', 'en erreur') : t('building', 'en cours')} · ${timeAgo(latest.createdAt)}` : '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 text-faint">{t('Folder', 'Dossier')}</dt>
            <dd className="m-0 truncate font-mono text-[11.5px] text-muted">{project.folder?.replace(/^\/home\/[^/]+/, '~') ?? '—'}</dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {st.kind === 'review' ? (
            <>
              <button
                className={btn(true)}
                onClick={() => {
                  seen();
                  open();
                }}
              >
                {t('See the result', 'Voir le résultat')}
              </button>
              <button className={btn()} onClick={seen}>
                {t('Mark as seen', 'Marquer comme vu')}
              </button>
            </>
          ) : st.kind === 'error' && latest ? (
            <>
              <button className={btn(true)} onClick={() => api().copy(buildErrorPrompt(project.name, latest.branch, latest.inspectorUrl))} title={t('Copies a request to paste into Claude Code', 'Copie une demande à coller dans Claude Code')}>
                {t('Copy for Claude', 'Copier pour Claude')}
              </button>
              {latest.inspectorUrl && (
                <button className={btn()} onClick={() => api().openExternal(latest.inspectorUrl!)}>
                  {t('Vercel log', 'Log Vercel')}
                </button>
              )}
              <button className={btn()} onClick={open}>
                {t('Open', 'Ouvrir')}
              </button>
            </>
          ) : (
            <>
              <button className={btn(true)} onClick={open}>
                {active ? t('Go back', 'Revenir') : t('Open', 'Ouvrir')}
              </button>
              {project.folder && !vp && (
                <button
                  className={btn()}
                  onClick={async () => {
                    await s.selectProject(project.id);
                    useStore.setState({ newProject: 'publish' });
                  }}
                >
                  {project.githubRepo ? t('Deploy on Vercel', 'Déployer sur Vercel') : t('Publish (GitHub, Vercel)', 'Publier (GitHub, Vercel)')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

const FEED_COLOR: Record<ClaudeEvent['kind'], string> = { start: '#6e6e77', prompt: '#d97757', tool: '#a1a1aa', waiting: '#e6c07b', stop: '#ededef', error: '#f28b82', end: '#6e6e77' };
const feedText = (e: ClaudeEvent) => {
  const file = e.file?.split('/').slice(-2).join('/');
  switch (e.kind) {
    case 'start':
      return t('Claude Code session started', 'Session Claude Code ouverte');
    case 'prompt':
      return t(`“${e.text ?? ''}”`, `« ${e.text ?? ''} »`);
    case 'tool':
      return file ? `${e.tool === 'Write' ? t('Creates', 'Crée') : t('Edits', 'Modifie')} ${file}` : `${e.tool}${e.text ? ` · ${e.text}` : ''}`;
    case 'waiting':
      return e.text ?? t('Waiting for you', 'Attend ta réponse');
    case 'stop':
      return t('Task done', 'Tâche terminée');
    case 'error':
      return t(`Error${e.text ? `: ${e.text}` : ''}`, `Erreur${e.text ? ` : ${e.text}` : ''}`);
    case 'end':
      return t('Session ended', 'Session fermée');
  }
};

/** "All projects": what Claude and Vercel are doing on every open project. */
export function ProjectsPage() {
  const s = useStore();
  const now = useNow();
  const open = s.settings.openIds.map((id) => s.settings.projects.find((p) => p.id === id)).filter((p): p is Project => !!p);
  const statuses = open.map((p) => projectStatus(s.claude[p.id], projectVercel(s, p.id).deployments, now));
  const count = (k: ProjectStatus['kind']) => statuses.filter((x) => x.kind === k).length;
  const summary = [
    count('working') && t(`Claude active on ${count('working')}`, `Claude actif sur ${count('working')}`),
    count('waiting') && t(`${count('waiting')} waiting for you`, `${count('waiting')} en attente de ta réponse`),
    count('review') && t(`${count('review')} to review`, `${count('review')} à vérifier`),
    count('building') && t(`${count('building')} build${count('building') > 1 ? 's' : ''} running`, `${count('building')} build${count('building') > 1 ? 's' : ''} en cours`),
    count('error') && t(`${count('error')} failed build${count('error') > 1 ? 's' : ''}`, `${count('error')} build${count('error') > 1 ? 's' : ''} en erreur`),
  ].filter(Boolean);
  const name = (id: string | null) => s.settings.projects.find((p) => p.id === id)?.name ?? t('No project', 'Hors projet');
  const close = () => s.setSection('apercu');
  // Escape leaves the page, unless a dialog or a field has it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]') || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      useStore.getState().setSection('apercu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const feed = Object.values(s.claude)
    .flatMap((c) => c.events)
    .filter((e) => e.kind !== 'tool' || e.file)
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">
            {t(`${open.length} open project${open.length > 1 ? 's' : ''}`, `${open.length} projet${open.length > 1 ? 's' : ''} ouvert${open.length > 1 ? 's' : ''}`)}
          </h1>
          <span className="flex items-center gap-3">
            <span className="text-[12.5px] text-muted">{summary.length ? summary.join(' · ') : t('Nothing running.', 'Rien en cours.')}</span>
            <button onClick={close} title={t('Close (Esc)', 'Fermer (Échap)')} className="flex h-7 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-fg hover:border-line-strong">
              {t('Close', 'Fermer')}
              <span className="font-mono text-[10px] text-ghost">{t('Esc', 'Échap')}</span>
            </button>
          </span>
        </div>
        {open.length ? (
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
            {open.map((p, i) => (
              <Card key={p.id} project={p} index={i} st={statuses[i]!} />
            ))}
          </div>
        ) : (
          <p className="text-faint">{t('No open projects.', 'Aucun projet ouvert.')}</p>
        )}
        <button onClick={() => useStore.setState({ switcherOpen: true })} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a2a2f] text-muted hover:border-line-strong hover:text-fg">
          + {t('Open a project', 'Ouvrir un projet')} <span className="font-mono text-[11px] text-ghost">Ctrl P</span>
        </button>
        <button onClick={() => useStore.setState({ newProject: 'create' })} className="-mt-1.5 flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a2a2f] text-muted hover:border-line-strong hover:text-fg">
          + {t('New project from scratch', 'Nouveau projet de zéro')}
        </button>
      </main>
      <aside aria-label={t('Claude activity', 'Activité de Claude')} className="flex w-[340px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-line-soft bg-chrome px-[18px] py-[22px]">
        <span className="label">{t('Claude activity, all projects', 'Activité de Claude, tous projets')}</span>
        {feed.map((e, i) => (
          <div key={`${e.at}-${i}`} className="flex gap-2.5">
            <span className="w-14 shrink-0 font-mono text-[11px] whitespace-nowrap text-ghost">{new Date(e.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: FEED_COLOR[e.kind] }} />
            <span className="flex min-w-0 flex-col gap-px">
              <span className="text-[11.5px] text-faint">{name(e.projectId)}</span>
              <span className="text-[12.5px] leading-[1.4] break-words text-fg">{feedText(e)}</span>
            </span>
          </div>
        ))}
        {!feed.length && (
          <p className="m-0 text-xs leading-5 text-faint">
            {s.claudeHooks?.installed
              ? t('Nothing yet. Activity from your Claude Code sessions will show up here.', 'Rien pour l’instant. L’activité de tes sessions Claude Code apparaîtra ici.')
              : t('Claude Code tracking is off.', 'Le suivi de Claude Code n’est pas activé.')}
          </p>
        )}
        {!s.claudeHooks?.installed && (
          <div className="mt-auto flex flex-col items-start gap-2.5 rounded-[10px] border border-dashed border-[#2a2a2f] p-3 text-xs leading-normal text-muted">
            {t(
              'Kinglet can track your Claude Code sessions (start, changed files, task end) with Claude Code hooks, and let you know when a task finishes.',
              'Kinglet peut suivre tes sessions Claude Code (début, fichiers modifiés, fin de tâche) grâce aux hooks de Claude Code, et te prévenir quand une tâche se termine.',
            )}
            <button className={btn()} onClick={() => s.openSettings('mcp')}>
              {t('Turn on in settings', 'Activer dans les réglages')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
