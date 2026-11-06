import { t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { Project } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';

/** Same rule as the main process (folder, npm, GitHub and Vercel names). */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

type StepId = 'github' | 'vercel';
type StepState = { status: 'pending' | 'running' | 'done' | 'error' | 'skipped'; detail?: string | null; link?: { label: string; url: string } | null };

const btn = (primary = false) =>
  `inline-flex h-8 items-center justify-center rounded-ui px-3 text-xs font-medium whitespace-nowrap disabled:opacity-50 ${primary ? 'bg-fg font-semibold text-bg' : 'border border-[#2a2a2f] bg-active text-fg hover:border-line-strong'}`;
const field = 'h-8 min-w-0 rounded-ui border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-line-strong';
const tilde = (p: string) => p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');

/** What Claude gets in its input for a new project (the user reads it, completes it and sends it). */
export const newProjectPrompt = (name: string, idea: string) =>
  t(
    `New project “${name}”, in this empty folder (git is initialized, branch main).${idea ? `\n\nWhat I want: ${idea}` : ''}\n\nHelp me choose the technical stack: ask what you need to know, suggest one (and why), and wait until I agree. Then set the project up here, with a "dev" script in package.json, and commit. Don't start the dev server yourself: Kinglet runs it (npm run dev) and shows the site on every device. Once it works, I'll publish it on GitHub and Vercel from Kinglet.`,
    `Nouveau projet « ${name} », dans ce dossier vide (git est initialisé, branche main).${idea ? `\n\nCe que je veux : ${idea}` : ''}\n\nAide-moi à choisir la stack technique : pose-moi les questions utiles, propose-m’en une (et pourquoi), et attends mon accord. Ensuite, mets le projet en place ici, avec un script "dev" dans package.json, et fais un commit. Ne lance pas le serveur de dev toi-même : Kinglet le lance (npm run dev) et affiche le site sur tous les appareils. Une fois que ça marche, je le publierai sur GitHub et Vercel depuis Kinglet.`,
  );

/**
 * "New project": an empty folder with git, opened in a tab with Claude, who chooses the stack with
 * the user and sets it up. Mode "publish": GitHub repository and Vercel project of the active project.
 */
export function NewProjectDialog() {
  const s = useStore();
  const mode = s.newProject;
  const { openOverlay, closeOverlay } = s;
  const target = mode === 'publish' ? activeProject(s.settings) : null;
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
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
    setIdea('');
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
        const p = await api().projects.create({ name: name.trim(), parent });
        close();
        const st = useStore.getState();
        await st.selectProject(p.id);
        st.setSection('apercu');
        st.toggleClaude(true);
        useStore.getState().askClaude(newProjectPrompt(name.trim(), idea.trim()));
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
    } finally {
      setBusy(false);
    }
  };

  const LABEL: Record<StepId, string> = {
    github: t('GitHub repository and push', 'Dépôt GitHub et push'),
    vercel: t('Vercel project and first deployment', 'Projet Vercel et premier déploiement'),
  };
  const stepRow = (id: StepId, st: StepState) => {
    const { status, detail } = st;
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
        {status === 'error' && (
          <button disabled={busy} onClick={() => void retry(id)} className={btn()}>
            {t('Retry', 'Réessayer')}
          </button>
        )}
      </li>
    );
  };

  const canCreate = mode === 'create' ? !!slug && !!parent : !!target?.folder && ((toGitHub && !target.githubRepo && !!github) || (toVercel && !target.vercelProjectId && !!vercel));

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/55 pt-[52px]" onMouseDown={() => !busy && close()}>
      <div role="dialog" aria-modal="true" aria-label={mode === 'create' ? t('New project', 'Nouveau projet') : t('Publish the project', 'Publier le projet')} className="flex h-fit max-h-[calc(100vh-104px)] w-[600px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex flex-col gap-1 border-b border-line-soft px-5 py-4">
          <h2 className="m-0 text-[15px] font-semibold">{mode === 'create' ? t('New project', 'Nouveau projet') : t(`Publish ${target?.name ?? ''}`, `Publier ${target?.name ?? ''}`)}</h2>
          <p className="m-0 text-xs leading-[1.5] text-muted">
            {mode === 'create'
              ? t('Kinglet creates the folder and opens Claude in it: you choose the stack together. Kinglet then runs the dev server and shows the site; publish it on GitHub and Vercel when it’s ready.', 'Kinglet crée le dossier et y ouvre Claude : vous choisissez la stack ensemble. Kinglet lance ensuite le serveur de dev et affiche le site ; publie-le sur GitHub et Vercel quand il est prêt.')
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
                  <label className="flex flex-col gap-1.5">
                    <span className="label">{t('The idea (optional)', 'L’idée (facultatif)')}</span>
                    <textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      rows={3}
                      placeholder={t('A site for my pottery workshop: classes, booking, a gallery…', 'Un site pour mon atelier de poterie : cours, réservation, galerie…')}
                      className="min-w-0 resize-y rounded-ui border border-line bg-bg px-2.5 py-2 text-[13px] leading-[1.45] text-fg outline-none focus:border-line-strong"
                    />
                    <span className="text-[11.5px] text-faint">{t('Given to Claude, who suggests a stack with you before writing anything.', 'Donnée à Claude, qui te propose une stack avant d’écrire quoi que ce soit.')}</span>
                  </label>
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

              {mode === 'publish' && !target?.githubRepo && (
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

              {mode === 'publish' && !target?.vercelProjectId && (
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
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line-soft bg-[#0e0e10] px-5 py-3">
          {!steps ? (
            <>
              <button className={btn()} onClick={close}>
                {t('Cancel', 'Annuler')}
              </button>
              <button className={btn(true)} disabled={!canCreate || busy} onClick={() => void run()}>
                {mode === 'create' ? t('Create and open with Claude', 'Créer et ouvrir avec Claude') : t('Publish', 'Publier')}
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
