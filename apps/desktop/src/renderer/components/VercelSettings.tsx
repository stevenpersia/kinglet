import { t } from '@parakeet/core';
import { useEffect, useState } from 'react';
import { activeProject, patchProject } from '../../shared/projects';
import type { Project, VercelState } from '../../shared/types';
import { api, cleanError, projectVercel, useStore } from '../store';
import { Dot } from './Icons';

const TOKENS_URL = 'https://vercel.com/account/tokens';

const field = 'h-8 rounded-ui border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-line-strong';
const btn = 'flex h-8 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';
const primary = 'flex h-8 items-center justify-center rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60';

/** Vercel connection (token). Each project picks its Vercel project in ProjectSettings. */
export function VercelSettings() {
  const vercel = useStore((s) => s.vercel);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: string, fn: () => Promise<VercelState>) => {
    setBusy(what);
    setError(null);
    try {
      useStore.setState({ vercel: await fn() });
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(null);
    }
  };

  if (!vercel?.connected) {
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-3.5">
        <p className="m-0 text-muted">
          {t('Create a personal token at', 'Crée un jeton personnel sur')}{' '}
          <button onClick={() => api().openExternal(TOKENS_URL)} className="text-fg underline underline-offset-2">
            vercel.com/account/tokens
          </button>{' '}
          {t(
            '(scope: your account or the project’s team), then paste it here. It’s encrypted with the system keyring and never leaves your machine, except to the Vercel API.',
            '(portée : ton compte ou l’équipe du projet), puis colle-le ici. Il est chiffré avec le trousseau du système et ne quitte pas ta machine, sauf vers l’API Vercel.',
          )}
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void run('connect', () => api().vercel.connect(token)).then(() => setToken(''));
          }}
        >
          <label htmlFor="vercel-token" className="sr-only">
            {t('Vercel token', 'Jeton Vercel')}
          </label>
          <input id="vercel-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('Vercel token', 'Jeton Vercel')} autoComplete="off" spellCheck={false} className={`${field} flex-1 font-mono`} />
          <button type="submit" disabled={!token.trim() || !!busy} className={primary}>
            {busy ? t('Connecting…', 'Connexion…') : t('Connect', 'Connecter')}
          </button>
        </form>
        {(error ?? vercel?.error) && <p className="m-0 text-xs text-err">{error ?? vercel?.error}</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="flex items-center gap-3 p-3.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-fg">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 L22 20 H2 Z" fill="#0a0a0b" />
          </svg>
        </span>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">
            {t('Signed in as', 'Connecté en tant que')} {vercel.user?.username}
          </span>
          <span className="text-xs text-muted">
            {t(
              `${vercel.projects.length} project${vercel.projects.length > 1 ? 's' : ''} across ${vercel.teams.length + 1} account${vercel.teams.length ? 's' : ''}`,
              `${vercel.projects.length} projet${vercel.projects.length > 1 ? 's' : ''} sur ${vercel.teams.length + 1} compte${vercel.teams.length ? 's' : ''}`,
            )}{' '}
            ·{' '}
            {vercel.storage === 'keyring'
              ? t('token encrypted with the system keyring.', 'jeton chiffré par le trousseau du système.')
              : vercel.storage === 'basic'
                ? t('no keyring found: token encrypted with a weak key.', 'aucun trousseau détecté : jeton chiffré avec une clé faible.')
                : t('encryption unavailable: token stored in plain text (file readable only by you).', 'chiffrement indisponible : jeton stocké en clair (fichier lisible par toi seul).')}
          </span>
        </div>
        <button onClick={() => void run('projects', () => api().vercel.refreshProjects())} disabled={!!busy} className={btn}>
          {busy === 'projects' ? t('Updating…', 'Mise à jour…') : t('Refresh projects', 'Actualiser les projets')}
        </button>
        <button onClick={() => void run('disconnect', () => api().vercel.disconnect())} className={btn}>
          {t('Disconnect', 'Déconnecter')}
        </button>
      </div>
      {(error ?? vercel.error) && <p className="m-0 border-t border-line-soft px-3.5 py-2.5 text-xs text-err">{error ?? vercel.error}</p>}
    </div>
  );
}

/** The active project: its Vercel project, folder on disk, local server, protected previews. */
export function ProjectSettings() {
  const s = useStore();
  const project = activeProject(s.settings);
  const vercel = s.vercel;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmBypass, setConfirmBypass] = useState(false);
  const [origin, setOrigin] = useState(project?.localOrigin ?? '');
  useEffect(() => setOrigin(project?.localOrigin ?? ''), [project?.id, project?.localOrigin]);

  if (!project) return <p className="m-0 rounded-[10px] border border-line bg-card p-3.5 text-muted">{t('No project open. Ctrl P to open one.', 'Aucun projet ouvert. Ctrl P pour en ouvrir un.')}</p>;
  const patch = (p: Partial<Project>) => s.updateSettings(patchProject(s.settings, project.id, p));
  const vp = projectVercel(s).project;
  const link = (id: string) => {
    const next = vercel?.projects.find((x) => x.id === id) ?? null;
    void patch({ vercelProjectId: next?.id ?? null, teamId: next?.teamId ?? null, ...(next && project.id.startsWith('local:') ? { name: next.name } : {}) });
  };
  const pick = async () => {
    const r = await api().projects.pickFolder();
    if (!r) return;
    const linked = !project.vercelProjectId && r.vercelProjectId && vercel?.projects.find((x) => x.id === r.vercelProjectId);
    await patch({ folder: r.folder, ...(linked ? { vercelProjectId: linked.id, teamId: linked.teamId } : {}) });
  };
  const groups = vercel?.connected ? [{ id: null as string | null, name: `${vercel.user?.username ?? t('Personal', 'Personnel')} (${t('personal', 'personnel')})` }, ...vercel.teams.map((team) => ({ id: team.id as string | null, name: team.name }))] : [];
  const row = 'flex flex-wrap items-center gap-3 border-t border-line-soft p-3.5 first:border-t-0';
  const key = 'w-36 shrink-0 text-xs text-faint';

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <div className={row}>
        <span className={key}>{t('Name', 'Nom')}</span>
        <input aria-label={t('Project name', 'Nom du projet')} value={project.name} onChange={(e) => void patch({ name: e.target.value })} className={`${field} min-w-56 flex-1`} />
      </div>
      <div className={row}>
        <span className={key}>{t('Vercel project', 'Projet Vercel')}</span>
        {vercel?.connected ? (
          <select aria-label={t('Vercel project', 'Projet Vercel')} value={project.vercelProjectId ?? ''} onChange={(e) => link(e.target.value)} className={`${field} min-w-56 flex-1`}>
            <option value="">{t('— None —', '— Aucun —')}</option>
            {groups.map((g) => (
              <optgroup key={String(g.id)} label={g.name}>
                {vercel.projects
                  .filter((x) => x.teamId === g.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.repo ? ` · ${x.repo}` : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <span className="text-xs text-muted">{t('Connect Vercel below to link this project.', 'Connecte Vercel ci-dessous pour relier ce projet.')}</span>
        )}
      </div>
      <div className={row}>
        <span className={key}>{t('Folder', 'Dossier')}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{project.folder ?? <span className="font-sans text-muted">{t('None: Parakeet can’t follow Claude Code on this project.', 'Aucun : Parakeet ne peut pas suivre Claude Code sur ce projet.')}</span>}</span>
        <button onClick={() => void pick()} className={btn}>
          {project.folder ? t('Change…', 'Changer…') : t('Choose folder…', 'Choisir le dossier…')}
        </button>
      </div>
      <form
        className={row}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            void patch({ localOrigin: origin.trim() ? new URL(/^https?:/.test(origin) ? origin : `http://${origin}`).origin : null });
            setError(null);
          } catch {
            setError(t('Invalid local address', 'Adresse locale invalide'));
          }
        }}
      >
        <label htmlFor="local-origin" className={key}>
          {t('Local server', 'Serveur local')}
        </label>
        <input id="local-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="http://localhost:3000" spellCheck={false} className={`${field} min-w-56 flex-1 font-mono`} />
        <button type="submit" disabled={origin === (project.localOrigin ?? '')} className={btn}>
          {t('Save', 'Enregistrer')}
        </button>
      </form>
      {vp && (
        <div className="flex items-start gap-3 border-t border-line-soft p-3.5 text-xs">
          <span className={key}>{t('Protected previews', 'Previews protégées')}</span>
          {vp.bypassSecrets.length ? (
            <span className="flex items-center gap-1.5 text-fg">
              <Dot className="bg-ok" />
              {t('Bypass secret found: Parakeet opens and reads protected previews.', 'Secret de contournement trouvé : Parakeet ouvre et lit les previews protégées.')}
            </span>
          ) : confirmBypass ? (
            <span className="flex flex-col gap-2 text-muted">
              {t(
                `Parakeet will create a “Protection Bypass for Automation” secret in the settings of the Vercel project ${vp.name}. It lets you open previews without signing in; you can revoke it in Vercel.`,
                `Parakeet va créer un secret « Protection Bypass for Automation » dans les réglages du projet Vercel ${vp.name}. Il permet d’ouvrir les previews sans te connecter ; tu pourras le révoquer dans Vercel.`,
              )}
              <span className="flex gap-2">
                <button
                  disabled={busy}
                  className={primary}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      useStore.setState({ vercel: await api().vercel.generateBypass(vp.id) });
                      setConfirmBypass(false);
                    } catch (e) {
                      setError(cleanError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('Create secret', 'Créer le secret')}
                </button>
                <button onClick={() => setConfirmBypass(false)} className={btn}>
                  {t('Cancel', 'Annuler')}
                </button>
              </span>
            </span>
          ) : (
            <span className="flex flex-col items-start gap-2 text-muted">
              {t(
                'No secret. If your previews require a Vercel login, Parakeet won’t be able to show them or read their tags.',
                'Aucun secret. Si tes previews demandent une connexion Vercel, Parakeet ne pourra ni les afficher ni lire leurs balises.',
              )}
              <button onClick={() => setConfirmBypass(true)} className={btn}>
                {t('Create a bypass secret…', 'Créer un secret de contournement…')}
              </button>
            </span>
          )}
        </div>
      )}
      {error && <p className="m-0 border-t border-line-soft px-3.5 py-2.5 text-xs text-err">{error}</p>}
    </div>
  );
}
