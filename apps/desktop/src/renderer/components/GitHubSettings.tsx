import { t } from '@kinglet/core';
import { useState } from 'react';
import { api, useStore } from '../store';

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
              'Optional. Vercel already gives each project’s repository; GitHub will show the pull request of each preview. Create a personal token (read access to your repositories is enough).',
              'Facultatif. Vercel donne déjà le dépôt de chaque projet ; GitHub affichera la pull request de chaque preview. Crée un jeton personnel (la lecture de tes dépôts suffit).',
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
            <button type="button" onClick={() => api().openExternal('https://github.com/settings/personal-access-tokens/new')} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
              {t('Create one', 'En créer un')}
            </button>
            <button type="submit" disabled={busy || !token.trim()} className="h-8 rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-50">
              {t('Connect', 'Connecter')}
            </button>
          </form>
          {github?.error && <p className="m-0 text-xs text-err">{github.error}</p>}
        </>
      )}
    </div>
  );
}
