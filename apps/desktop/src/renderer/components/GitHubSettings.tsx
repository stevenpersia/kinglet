import { t } from '@kinglet/core';
import { useState } from 'react';
import { api, useStore } from '../store';

/** GitHub's fine-grained token form, pre-filled with what Kinglet uses (PRs and CI of previews, issues reported from a preview). */
export const GITHUB_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Kinglet&description=Pull+requests+and+CI+of+previews&pull_requests=read&checks=read&issues=write';

/** What to tick when creating the GitHub token. */
export const githubScopes = () => [
  t('Repository access: the repositories of your projects (or all)', 'Accès aux dépôts : ceux de tes projets (ou tous)'),
  t('Pull requests: Read', 'Pull requests : lecture'),
  t('Checks: Read (CI status)', 'Checks : lecture (statut de la CI)'),
  t('Issues: Read and write (report a bug from a preview)', 'Issues : lecture et écriture (signaler un bug depuis une preview)'),
];

/** “No token yet? Create one” link, with the permissions to give it. */
export function TokenHelp({ name, url, scopes }: { name: string; url: string; scopes: string[] }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <p className="m-0">
        {t('No token yet?', 'Pas encore de jeton ?')}{' '}
        <button type="button" onClick={() => api().openExternal(url)} className="text-fg underline underline-offset-2 hover:text-muted">
          {t(`Create one on ${name} ↗`, `En créer un sur ${name} ↗`)}
        </button>{' '}
        {t('with:', 'avec :')}
      </p>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-faint">
        {scopes.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

/** GitHub account (optional): a personal token, kept encrypted on this computer. */
export function GitHubSettings() {
  const github = useStore((s) => s.github);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const set = async (p: Promise<import('../../shared/types').GitHubState>) => {
    setBusy(true);
    useStore.setState({ github: await p });
    setBusy(false);
  };
  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-[10px] border border-line bg-card p-3.5">
      {github?.connected ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium">{github.user?.name ?? github.user?.login}</span>
            <span className="font-mono text-xs text-muted">@{github.user?.login}</span>
          </div>
          <button disabled={busy} onClick={() => void set(api().github.disconnect())} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium hover:border-line-strong disabled:opacity-60">
            {t('Disconnect', 'Déconnecter')}
          </button>
        </div>
      ) : (
        <>
          <span className="text-xs leading-relaxed text-muted">
            {t(
              'Optional. Vercel already gives each project’s repository; GitHub shows the pull request and CI of each preview.',
              'Facultatif. Vercel donne déjà le dépôt de chaque projet ; GitHub affiche la pull request et la CI de chaque preview.',
            )}
          </span>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim()) void set(api().github.connect(token)).then(() => setToken(''));
            }}
          >
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder={t('Personal token', 'Jeton personnel')} aria-label={t('GitHub token', 'Jeton GitHub')} className="h-8 min-w-0 flex-1 rounded-ui border border-line bg-bg px-2.5 font-mono text-xs text-fg outline-none focus:border-line-strong" />
            <button type="submit" disabled={busy || !token.trim()} className="h-8 rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-50">
              {t('Connect', 'Connecter')}
            </button>
          </form>
          <TokenHelp name="GitHub" url={GITHUB_TOKEN_URL} scopes={githubScopes()} />
          {github?.error && <p className="m-0 text-xs text-err">{github.error}</p>}
        </>
      )}
    </div>
  );
}
