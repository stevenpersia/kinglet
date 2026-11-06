import { t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { Project, TemplateId } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';

const TEMPLATES: { id: TemplateId; name: string; detail: () => string }[] = [
  { id: 'vite-react', name: 'React + Vite', detail: () => t('TypeScript, one page to start. Fast to reload.', 'TypeScript, une page pour commencer. Rechargement instantané.') },
  { id: 'next', name: 'Next.js', detail: () => t('App Router: pages, server rendering, API routes.', 'App Router : pages, rendu serveur, routes API.') },
  { id: 'static', name: t('Static site', 'Site statique'), detail: () => t('HTML, CSS and JavaScript, served by Vite.', 'HTML, CSS et JavaScript, servis par Vite.') },
];

/** Same rule as the main process (folder, npm, GitHub and Vercel names). */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

type StepId = 'files' | 'dev' | 'github' | 'vercel';
type StepState = { status: 'pending' | 'running' | 'done' | 'error' | 'skipped'; detail?: string | null; link?: { label: string; url: string } | null };

const btn = (primary = false) =>
  `inline-flex h-8 items-center justify-center rounded-ui px-3 text-xs font-medium whitespace-nowrap disabled:opacity-50 ${primary ? 'bg-fg font-semibold text-bg' : 'border border-[#2a2a2f] bg-active text-fg hover:border-line-strong'}`;
const field = 'h-8 min-w-0 rounded-ui border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-line-strong';
const tilde = (p: string) => p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');

/**
 * A project from scratch, in one go: the starter's files and a first commit, its dev server
 * started in Kinglet (Claude opens in its folder), then its GitHub repository and its Vercel
 * project. Also publishes a project that is only on this computer (mode "publish").
 */
export function NewProjectDialog() {
  const s = useStore();
  const mode = s.newProject;
  const { openOverlay, closeOverlay } = s;
  const target = mode === 'publish' ? activeProject(s.settings) : null;
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('vite-react');
  const [parent, setParent] = useState<string | null>(null);
  const [toGitHub, setToGitHub] = useState(true);
  const [owner, setOwner] = useState<string | null>(null);
  const [owners, setOwners] = useState<string[]>([]);
  const [priv, setPriv] = useState(true);
  const [toVercel, setToVercel] = useState(true);
  const [team, setTeam] = useState<string | null>(null);
  const [steps, setSteps] = useState<Partial<Record<StepId, StepState>> | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const github = s.github?.connected ? s.github : null;
  const vercel = s.vercel?.connected ? s.vercel : null;
  const teams = vercel ? [...(vercel.user?.defaultTeamId ? [] : [{ id: null as string | null, name: t('Personal', 'Personnel') }]), ...vercel.teams.map((x) => ({ id: x.id as string | null, name: x.name }))] : [];

  useEffect(() => {
    if (!mode) return;
    void openOverlay();
    setSteps(null);
    setProject(null);
    setError(null);
    setBusy(false);
    const current = mode === 'publish' ? activeProject(useStore.getState().settings) : null;
    setName(current ? current.name : '');
    setToGitHub(!current?.githubRepo);
    setToVercel(!current?.vercelProjectId);
    if (mode === 'create') void api().projects.defaultParent().then(setParent);
    if (useStore.getState().github?.connected)
      void api()
        .github.owners()
        .then((list) => {
          setOwners(list);
          setOwner(list[0] ?? null);
        })
        .catch(() => undefined);
    const v = useStore.getState().vercel;
    setTeam(v?.user?.defaultTeamId ?? v?.teams[0]?.id ?? null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.setState({ newProject: null });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      closeOverlay();
    };
  }, [mode, openOverlay, closeOverlay]);

  if (!mode) return null;
  const close = () => useStore.setState({ newProject: null });
  const slug = slugify(name);
  const set = (id: StepId, st: StepState) => setSteps((cur) => ({ ...cur, [id]: st }));

  const publishGitHub = async (p: Project) => {
    set('github', { status: 'running' });
    try {
      const repo = await api().projects.publishGitHub(p.id, { name: slug || p.name, owner, private: priv });
      set('github', { status: 'done', detail: repo.fullName, link: { label: t('Open on GitHub', 'Ouvrir sur GitHub'), url: repo.htmlUrl } });
      return true;
    } catch (e) {
      set('github', { status: 'error', detail: cleanError(e) });
      return false;
    }
  };
  const publishVercel = async (p: Project) => {
    set('vercel', { status: 'running' });
    try {
      const r = await api().projects.publishVercel(p.id, { name: slug || p.name, teamId: team });
      const url = r.deploymentUrl ?? r.url;
      set('vercel', {
        status: 'done',
        detail: r.deployError ? t(`Project created; the first deployment didn’t start (${r.deployError}). The next push deploys it.`, `Projet créé ; le premier déploiement n’a pas démarré (${r.deployError}). Le prochain push le déploiera.`) : t('First production deployment started.', 'Premier déploiement de production lancé.'),
        link: r.inspectorUrl ? { label: t('Follow the build', 'Suivre le build'), url: r.inspectorUrl } : url ? { label: t('Open the site', 'Ouvrir le site'), url } : null,
      });
    } catch (e) {
      set('vercel', { status: 'error', detail: cleanError(e) });
    }
  };

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        if (!slug || !parent) return;
        setSteps({ files: { status: 'running' }, dev: { status: 'pending' }, ...(toGitHub && github ? { github: { status: 'pending' } } : {}), ...(toGitHub && toVercel && github && vercel ? { vercel: { status: 'pending' } } : {}) });
        let p: Project;
        try {
          p = await api().projects.create({ name: name.trim(), template, parent });
        } catch (e) {
          set('files', { status: 'error', detail: cleanError(e) });
          return;
        }
        setProject(p);
        set('files', { status: 'done', detail: tilde(p.folder ?? '') });
        await useStore.getState().selectProject(p.id);
        useStore.getState().setSection('apercu');
        useStore.getState().toggleClaude(true);
        set('dev', { status: 'running' });
        try {
          await api().dev.start(p.id);
          set('dev', { status: 'done' });
        } catch (e) {
          set('dev', { status: 'error', detail: cleanError(e) });
        }
        if (toGitHub && github && (await publishGitHub(p)) && toVercel && vercel) await publishVercel(p);
      } else if (target) {
        setProject(target);
        setSteps({ ...(toGitHub && !target.githubRepo ? { github: { status: 'pending' } } : {}), ...(toVercel && !target.vercelProjectId ? { vercel: { status: 'pending' } } : {}) });
        const ok = toGitHub && !target.githubRepo ? await publishGitHub(target) : true;
        if (ok && toVercel && !target.vercelProjectId) await publishVercel(useStore.getState().settings.projects.find((x) => x.id === target.id) ?? target);
      }
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const retry = async (id: StepId) => {
    const p = project && useStore.getState().settings.projects.find((x) => x.id === project.id);
    if (!p) return;
    setBusy(true);
    try {
      if (id === 'github' && (await publishGitHub(p)) && steps?.vercel) await publishVercel(useStore.getState().settings.projects.find((x) => x.id === p.id) ?? p);
      if (id === 'vercel') await publishVercel(p);
      if (id === 'dev') {
        set('dev', { status: 'running' });
        await api()
          .dev.start(p.id)
          .then(() => set('dev', { status: 'done' }))
          .catch((e) => set('dev', { status: 'error', detail: cleanError(e) }));
      }
    } finally {
      setBusy(false);
    }
  };

  const dev = project ? s.dev[project.id] : undefined;
  const devDetail = (): string | null => {
    if (!dev) return null;
    if (dev.status === 'installing') return t('Installing the dependencies…', 'Installation des dépendances…');
    if (dev.status === 'starting') return t(`Starting ${dev.command}…`, `Démarrage de ${dev.command}…`);
    if (dev.status === 'running') return t(`${dev.command} · ${dev.url ?? ''} · shown on the devices`, `${dev.command} · ${dev.url ?? ''} · affiché sur les appareils`);
    if (dev.status === 'error') return dev.error;
    return null;
  };
  const LABEL: Record<StepId, string> = {
    files: t('Project files and first commit', 'Fichiers du projet et premier commit'),
    dev: t('Dev server, in Kinglet', 'Serveur de dev, dans Kinglet'),
    github: t('GitHub repository and push', 'Dépôt GitHub et push'),
    vercel: t('Vercel project and first deployment', 'Projet Vercel et premier déploiement'),
  };
  const stepRow = (id: StepId, st: StepState) => {
    const live = id === 'dev' && st.status === 'done' && dev ? dev : null;
    const status = live ? (live.status === 'running' ? 'done' : live.status === 'error' ? 'error' : 'running') : st.status;
    const detail = live ? devDetail() : st.detail;
    const mark = { pending: '○', running: '◌', done: '✓', error: '!', skipped: '–' }[status];
    const color = { pending: 'text-ghost', running: 'text-warn', done: 'text-ok', error: 'text-err', skipped: 'text-ghost' }[status];
    return (
      <li key={id} className="flex gap-3 rounded-lg border border-line-soft bg-bg px-3 py-2.5">
        <span aria-hidden="true" className={`w-3.5 shrink-0 text-center font-mono text-[13px] ${color} ${status === 'running' ? 'animate-pulse' : ''}`}>
          {mark}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{LABEL[id]}</span>
          {detail && <span className={`text-xs leading-[1.45] break-words ${status === 'error' ? 'text-err' : 'text-muted'}`}>{detail}</span>}
          {st.link && (
            <button onClick={() => api().openExternal(st.link!.url)} className="w-fit text-xs text-fg underline-offset-2 hover:underline">
              {st.link.label} ↗
            </button>
          )}
        </span>
        {status === 'error' && id !== 'files' && (
          <button disabled={busy} onClick={() => void retry(id)} className={btn()}>
            {t('Retry', 'Réessayer')}
          </button>
        )}
      </li>
    );
  };

  const canCreate = mode === 'create' ? !!slug && !!parent : !!target?.folder && ((toGitHub && !target.githubRepo && !!github) || (toVercel && !target.vercelProjectId && !!vercel));
  const finished = !!steps && !busy;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/55 pt-[52px]" onMouseDown={() => !busy && close()}>
      <div role="dialog" aria-modal="true" aria-label={mode === 'create' ? t('New project', 'Nouveau projet') : t('Publish the project', 'Publier le projet')} className="flex h-fit max-h-[calc(100vh-104px)] w-[600px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex flex-col gap-1 border-b border-line-soft px-5 py-4">
          <h2 className="m-0 text-[15px] font-semibold">{mode === 'create' ? t('New project', 'Nouveau projet') : t(`Publish ${target?.name ?? ''}`, `Publier ${target?.name ?? ''}`)}</h2>
          <p className="m-0 text-xs leading-[1.5] text-muted">
            {mode === 'create'
              ? t('Kinglet writes a starter, runs its dev server, opens Claude in its folder, and can put it on GitHub and Vercel right away.', 'Kinglet écrit un projet de départ, lance son serveur de dev, ouvre Claude dans son dossier, et peut le mettre sur GitHub et Vercel tout de suite.')
              : t('Create its GitHub repository, then a Vercel project that deploys every push.', 'Crée son dépôt GitHub, puis un projet Vercel qui déploie chaque push.')}
          </p>
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
          {!steps ? (
            <>
              {mode === 'create' && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="label">{t('Name', 'Nom')}</span>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && canCreate && void run()}
                      placeholder={t('My new site', 'Mon nouveau site')}
                      className={field}
                    />
                    {name && <span className="font-mono text-[11px] text-faint">{slug ? `${tilde(parent ?? '')}/${slug}` : t('Use at least one letter or digit.', 'Mets au moins une lettre ou un chiffre.')}</span>}
                  </label>
                  <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                    <legend className="label mb-1.5">{t('Starter', 'Départ')}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {TEMPLATES.map((tp) => (
                        <button
                          key={tp.id}
                          type="button"
                          aria-pressed={template === tp.id}
                          onClick={() => setTemplate(tp.id)}
                          className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left ${template === tp.id ? 'border-line-strong bg-raised shadow-[inset_0_0_0_1px_#3a3a40]' : 'border-line bg-bg hover:border-line-strong'}`}
                        >
                          <span className="text-[13px] font-medium">{tp.name}</span>
                          <span className="text-[11.5px] leading-[1.4] text-muted">{tp.detail()}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-col gap-1.5">
                    <span className="label">{t('Location', 'Emplacement')}</span>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate rounded-ui border border-line bg-bg px-2.5 py-[7px] font-mono text-xs text-muted">{parent ? tilde(parent) : '…'}</span>
                      <button type="button" className={btn()} onClick={() => void api().projects.pickParent(parent).then((p) => p && setParent(p))}>
                        {t('Change…', 'Changer…')}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {mode === 'publish' && !target?.folder && <p className="m-0 text-xs text-err">{t('This project has no folder on this computer: choose it first (Settings → Project).', 'Ce projet n’a pas de dossier sur cet ordinateur : choisis-le d’abord (Réglages → Projet).')}</p>}

              {!(mode === 'publish' && target?.githubRepo) && (
                <div className="flex flex-col gap-2 rounded-lg border border-line-soft bg-bg p-3">
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" checked={toGitHub && !!github} disabled={!github} onChange={(e) => setToGitHub(e.target.checked)} />
                    <span className="flex-1 font-medium">{t('Create the GitHub repository and push', 'Créer le dépôt GitHub et pousser')}</span>
                    {!github && (
                      <button type="button" className="text-xs text-fg underline-offset-2 hover:underline" onClick={() => (close(), s.openSettings('github'))}>
                        {t('Connect GitHub', 'Connecter GitHub')}
                      </button>
                    )}
                  </label>
                  {github && toGitHub && (
                    <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-muted">
                      {owners.length > 1 ? (
                        <select value={owner ?? ''} onChange={(e) => setOwner(e.target.value)} aria-label={t('Owner', 'Propriétaire')} className={field}>
                          {owners.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono">{owner ?? github.user?.login}</span>
                      )}
                      <span className="font-mono">/ {slug || '…'}</span>
                      <span className="ml-auto flex items-center gap-1" role="group" aria-label={t('Visibility', 'Visibilité')}>
                        {[true, false].map((v) => (
                          <button key={String(v)} type="button" aria-pressed={priv === v} onClick={() => setPriv(v)} className={`h-6 rounded-md px-2 ${priv === v ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`}>
                            {v ? t('Private', 'Privé') : t('Public', 'Public')}
                          </button>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!(mode === 'publish' && target?.vercelProjectId) && (
                <div className="flex flex-col gap-2 rounded-lg border border-line-soft bg-bg p-3">
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" checked={toVercel && !!vercel && (toGitHub || !!target?.githubRepo)} disabled={!vercel || !(toGitHub || target?.githubRepo)} onChange={(e) => setToVercel(e.target.checked)} />
                    <span className="flex-1 font-medium">{t('Deploy on Vercel', 'Déployer sur Vercel')}</span>
                    {!vercel && (
                      <button type="button" className="text-xs text-fg underline-offset-2 hover:underline" onClick={() => (close(), s.openSettings('vercel'))}>
                        {t('Connect Vercel', 'Connecter Vercel')}
                      </button>
                    )}
                  </label>
                  {vercel && toVercel && (toGitHub || target?.githubRepo) && (
                    <div className="flex flex-col gap-2 pl-6 text-xs text-muted">
                      {teams.length > 1 && (
                        <select value={team ?? ''} onChange={(e) => setTeam(e.target.value || null)} aria-label={t('Vercel team', 'Équipe Vercel')} className={`${field} w-fit`}>
                          {teams.map((x) => (
                            <option key={String(x.id)} value={x.id ?? ''}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="leading-[1.45]">
                        {t('Linked to the repository: main deploys to production, every other branch gets a preview. Needs Vercel’s GitHub app on this account.', 'Relié au dépôt : main part en production, chaque autre branche a sa preview. Il faut l’app GitHub de Vercel sur ce compte.')}
                      </span>
                    </div>
                  )}
                  {vercel && !toGitHub && !target?.githubRepo && <span className="pl-6 text-xs text-faint">{t('Vercel deploys from the GitHub repository: create it too.', 'Vercel déploie depuis le dépôt GitHub : crée-le aussi.')}</span>}
                </div>
              )}
            </>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">{(Object.entries(steps) as [StepId, StepState][]).map(([id, st]) => stepRow(id, st))}</ol>
          )}
          {error && <p className="m-0 text-xs text-err">{error}</p>}
          {finished && mode === 'create' && project && (
            <p className="m-0 text-xs leading-[1.5] text-muted">
              {t('Claude Code runs in the project folder, in the column on the left: tell it what to build. Later pushes need your own git access to the repository (gh auth login, or an SSH key).', 'Claude Code tourne dans le dossier du projet, dans la colonne de gauche : dis-lui quoi construire. Pour les push suivants, il faut ton propre accès git au dépôt (gh auth login, ou une clé SSH).')}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line-soft bg-[#0e0e10] px-5 py-3">
          {!steps ? (
            <>
              <button className={btn()} onClick={close}>
                {t('Cancel', 'Annuler')}
              </button>
              <button className={btn(true)} disabled={!canCreate || busy} onClick={() => void run()}>
                {mode === 'create' ? t('Create the project', 'Créer le projet') : t('Publish', 'Publier')}
              </button>
            </>
          ) : (
            <button className={btn(true)} disabled={busy} onClick={close}>
              {busy ? t('Working…', 'En cours…') : t('Done', 'Terminé')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
