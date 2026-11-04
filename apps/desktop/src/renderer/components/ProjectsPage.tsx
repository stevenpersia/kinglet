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
  `Le build Vercel du projet ${name}${branch ? ` (branche ${branch})` : ''} a échoué.${inspector ? ` Log : ${inspector}` : ''} Lance le build en local (pnpm build ou npm run build), trouve l’erreur et corrige-la.`;

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
  const idleDetail = claude?.prompt ? `Dernière demande ${timeAgo(claude.lastAt)} : « ${claude.prompt} »` : project.folder ? 'Aucune session Claude Code suivie pour l’instant.' : 'Choisis le dossier du projet pour suivre Claude Code.';

  return (
    <article className={`flex gap-4 rounded-xl border bg-card p-4 ${st.kind === 'working' ? 'border-[rgba(217,119,87,0.45)]' : 'border-line'}`}>
      <button onClick={open} aria-label={`Ouvrir ${project.name}`} className="h-[236px] w-[118px] shrink-0 rounded-[18px] bg-black p-[3px] shadow-[0_0_0_1px_#2e2e33]">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full rounded-[15px] object-cover object-top" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-[15px] bg-active text-[11px] text-ghost">{active ? 'chargement…' : 'pas encore vu'}</span>
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
            <dt className="w-[74px] shrink-0 text-faint">Affiché</dt>
            <dd className="m-0 flex min-w-0 items-center gap-1.5">
              <Dot className={env ? ENV_DOT[env] : 'bg-ghost'} />
              <span className="truncate font-mono text-[11.5px]">{host(shown) ?? '—'}</span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 text-faint">Déploiement</dt>
            <dd className={`m-0 truncate ${latest?.state === 'ERROR' ? 'text-err' : ''}`}>
              {!vp ? <span className="text-ghost">pas relié à Vercel</span> : latest ? `${latest.production ? 'Prod' : 'Preview'} ${latest.state === 'READY' ? 'prête' : latest.state === 'ERROR' ? 'en erreur' : 'en cours'} · ${timeAgo(latest.createdAt)}` : '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 text-faint">Dossier</dt>
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
                Voir le résultat
              </button>
              <button className={btn()} onClick={seen}>
                Marquer comme vu
              </button>
            </>
          ) : st.kind === 'error' && latest ? (
            <>
              <button className={btn(true)} onClick={() => api().copy(buildErrorPrompt(project.name, latest.branch, latest.inspectorUrl))} title="Copie une demande à coller dans Claude Code">
                Copier pour Claude
              </button>
              {latest.inspectorUrl && (
                <button className={btn()} onClick={() => api().openExternal(latest.inspectorUrl!)}>
                  Log Vercel
                </button>
              )}
              <button className={btn()} onClick={open}>
                Ouvrir
              </button>
            </>
          ) : (
            <button className={btn(true)} onClick={open}>
              {active ? 'Revenir' : 'Ouvrir'}
            </button>
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
      return 'Session Claude Code ouverte';
    case 'prompt':
      return `« ${e.text ?? ''} »`;
    case 'tool':
      return file ? `${e.tool === 'Write' ? 'Crée' : 'Modifie'} ${file}` : `${e.tool}${e.text ? ` · ${e.text}` : ''}`;
    case 'waiting':
      return e.text ?? 'Attend ta réponse';
    case 'stop':
      return 'Tâche terminée';
    case 'error':
      return `Erreur${e.text ? ` : ${e.text}` : ''}`;
    case 'end':
      return 'Session fermée';
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
    count('working') && `Claude actif sur ${count('working')}`,
    count('waiting') && `${count('waiting')} en attente de ta réponse`,
    count('review') && `${count('review')} à vérifier`,
    count('building') && `${count('building')} build${count('building') > 1 ? 's' : ''} en cours`,
    count('error') && `${count('error')} build${count('error') > 1 ? 's' : ''} en erreur`,
  ].filter(Boolean);
  const name = (id: string | null) => s.settings.projects.find((p) => p.id === id)?.name ?? 'Hors projet';
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
            {open.length} projet{open.length > 1 ? 's' : ''} ouvert{open.length > 1 ? 's' : ''}
          </h1>
          <span className="text-[12.5px] text-muted">{summary.length ? summary.join(' · ') : 'Rien en cours.'}</span>
        </div>
        {open.length ? (
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
            {open.map((p, i) => (
              <Card key={p.id} project={p} index={i} st={statuses[i]!} />
            ))}
          </div>
        ) : (
          <p className="text-faint">Aucun projet ouvert.</p>
        )}
        <button onClick={() => useStore.setState({ switcherOpen: true })} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a2a2f] text-muted hover:border-line-strong hover:text-fg">
          + Ouvrir un projet <span className="font-mono text-[11px] text-ghost">Ctrl P</span>
        </button>
      </main>
      <aside aria-label="Activité de Claude" className="flex w-[340px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-line-soft bg-chrome px-[18px] py-[22px]">
        <span className="label">Activité de Claude, tous projets</span>
        {feed.map((e, i) => (
          <div key={`${e.at}-${i}`} className="flex gap-2.5">
            <span className="w-11 shrink-0 font-mono text-[11px] text-ghost">{new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: FEED_COLOR[e.kind] }} />
            <span className="flex min-w-0 flex-col gap-px">
              <span className="text-[11.5px] text-faint">{name(e.projectId)}</span>
              <span className="text-[12.5px] leading-[1.4] break-words text-fg">{feedText(e)}</span>
            </span>
          </div>
        ))}
        {!feed.length && (
          <p className="m-0 text-xs leading-5 text-faint">
            {s.claudeHooks?.installed ? 'Rien pour l’instant. L’activité de tes sessions Claude Code apparaîtra ici.' : 'Le suivi de Claude Code n’est pas activé.'}
          </p>
        )}
        {!s.claudeHooks?.installed && (
          <div className="mt-auto flex flex-col items-start gap-2.5 rounded-[10px] border border-dashed border-[#2a2a2f] p-3 text-xs leading-normal text-muted">
            Parakeet peut suivre tes sessions Claude Code (début, fichiers modifiés, fin de tâche) grâce aux hooks de Claude Code, et te prévenir quand une tâche se termine.
            <button className={btn()} onClick={() => s.setSection('reglages')}>
              Activer dans les réglages
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
