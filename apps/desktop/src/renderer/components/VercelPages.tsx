import { PrBadge, usePullRequests } from './PullRequest';
import { CompareVisual } from './CompareVisual';
import { samePageOn, t, type VercelDeployment } from '@parakeet/core';
import { useEffect, useState } from 'react';
import type { CompareColumn, EnvId } from '../../shared/types';
import { ENV_DOT, envTargets, timeAgo, urlOnEnv } from '../lib/env';
import { activeProject } from '../../shared/projects';
import { api, projectVercel, useStore } from '../store';
import { Dot, Icon } from './Icons';

const stateInfo = (): Record<string, { dot: string; label: string }> => ({
  READY: { dot: 'bg-ok', label: t('Ready', 'Prêt') },
  BUILDING: { dot: 'bg-warn', label: 'Build' },
  QUEUED: { dot: 'bg-ghost', label: t('Queued', 'En attente') },
  INITIALIZING: { dot: 'bg-ghost', label: t('Initializing', 'Démarrage') },
  ERROR: { dot: 'bg-err', label: t('Error', 'Erreur') },
  CANCELED: { dot: 'bg-ghost', label: t('Canceled', 'Annulé') },
});

function NotLinked({ what }: { what: string }) {
  return (
    <main className="stage-bg flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{what}</h1>
        <p className="m-0 leading-relaxed text-muted">
          {t(
            'Connect your Vercel account and pick this site’s project to see its deployments and compare local, preview and prod.',
            'Connecte ton compte Vercel et choisis le projet de ce site pour voir ses déploiements et comparer local, preview et prod.',
          )}
        </p>
        <button onClick={() => useStore.getState().openSettings('vercel')} className="mt-1 h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
          {t('Connect Vercel', 'Connecter Vercel')}
        </button>
      </div>
    </main>
  );
}

const btn = 'flex h-7 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-fg hover:border-line-strong';

export function DeploymentsPage() {
  const s = useStore();
  const { url, navigate } = s;
  const vercel = { ...projectVercel(s), syncedAt: s.vercel?.syncedAt ?? null, error: s.vercel?.error ?? null };
  const [filter, setFilter] = useState<'all' | 'prod' | 'preview'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const prs = usePullRequests();
  if (!vercel.project) return <NotLinked what={t('Deployments', 'Déploiements')} />;

  const list = vercel.deployments.filter((d) => filter === 'all' || (filter === 'prod' ? d.production : !d.production));
  // Open exactly this deployment (even an older one of a branch), on the same page.
  const open = (d: VercelDeployment) => {
    if (!d.production) useStore.setState({ previewId: d.id });
    void navigate(samePageOn(url, d.url));
    useStore.getState().setSection('apercu');
  };
  const refresh = async () => {
    setRefreshing(true);
    useStore.setState({ vercel: await api().vercel.refresh() });
    setRefreshing(false);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Deployments', 'Déploiements')}</h1>
          <p className="m-0 mt-1 text-muted">
            {vercel.project.name}
            {vercel.project.repo ? ` · ${vercel.project.repo}` : ''} · {t('synced', 'synchronisé')} {vercel.syncedAt ? timeAgo(vercel.syncedAt) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'prod', 'preview'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`inline-flex h-[26px] items-center rounded-md border px-2.5 text-xs ${filter === f ? 'border-line-strong bg-active font-medium text-fg' : 'border-line text-muted hover:border-line-strong'}`}>
              {f === 'all' ? t('All', 'Tout') : f === 'prod' ? 'Production' : 'Previews'}
            </button>
          ))}
          <button onClick={() => void refresh()} className={btn} aria-label={t('Refresh', 'Rafraîchir')}>
            <Icon name="reload" size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      {vercel.error && <p className="m-0 text-err">{vercel.error}</p>}
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {list.length === 0 && <p className="m-0 p-4 text-faint">{t('No deployments.', 'Aucun déploiement.')}</p>}
        {list.map((d) => {
          const states = stateInfo();
          const st = states[d.state] ?? states.QUEUED!;
          const showing = url ? new URL(url).origin === new URL(d.url).origin : false;
          return (
            <div key={d.id} className={`flex items-center gap-4 border-t border-line-soft px-4 py-3 first:border-t-0 ${showing ? 'bg-active' : ''}`}>
              <span className="flex w-24 shrink-0 items-center gap-2 text-xs text-muted">
                <Dot className={st.dot} />
                {st.label}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-mono text-[12.5px] text-fg">{d.branch ?? d.id}</span>
                  {d.production && <span className="rounded border border-prod/40 px-1.5 text-[10.5px] font-medium text-prod">PROD</span>}
                  {!d.production && d.branch && prs[d.branch] && <PrBadge pr={prs[d.branch]!} />}
                  {showing && <span className="text-[11px] text-faint">{t('shown', 'affiché')}</span>}
                </span>
                <span className="truncate text-xs text-muted">{d.commitMessage ?? d.url}</span>
              </div>
              <span className="hidden w-40 shrink-0 text-right text-xs text-faint md:block">
                {d.author ?? ''}
                {d.commitSha ? <span className="font-mono"> · {d.commitSha.slice(0, 7)}</span> : null}
                <br />
                {timeAgo(d.createdAt)}
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button onClick={() => open(d)} disabled={d.state !== 'READY'} className={`${btn} disabled:opacity-40`}>
                  <Icon name="eye" size={12} />
                  {t('Open', 'Ouvrir')}
                </button>
                {d.inspectorUrl && (
                  <button onClick={() => api().openExternal(d.inspectorUrl!)} className={btn} aria-label={t('Open in Vercel', 'Ouvrir dans Vercel')} title={t('Open in Vercel', 'Ouvrir dans Vercel')}>
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3 L22 20 H2 Z" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

const ROW_LABEL: Record<string, string> = { title: '<title>', description: 'description' };

export function ComparePage() {
  const s = useStore();
  const { url, previewId } = s;
  const vercel = projectVercel(s);
  const [columns, setColumns] = useState<CompareColumn[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'tags' | 'visual'>('tags');
  const envs = envTargets(activeProject(s.settings)?.localOrigin ?? null, vercel, previewId);
  const path = url ? new URL(url).pathname : '/';

  const targets = (['local', 'preview', 'prod'] as EnvId[])
    .map((env) => ({ env, url: urlOnEnv(url, env, envs) }))
    .filter((x): x is { env: EnvId; url: string } => !!x.url)
    .map((x) => ({ ...x, label: x.env === 'local' ? 'Local' : x.env === 'preview' ? `Preview · ${envs.preview?.branch ?? ''}` : 'Prod' }));
  const key = targets.map((x) => x.url).join('|');

  const run = async () => {
    if (!targets.length) return;
    setLoading(true);
    setColumns(await api().compare(targets));
    setLoading(false);
  };
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!vercel.project) return <NotLinked what={t('Compare', 'Comparer')} />;
  const rows = columns ? [...new Set(columns.flatMap((c) => Object.keys(c.values)))] : [];

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Compare', 'Comparer')}</h1>
          <p className="m-0 mt-1 text-muted">
            <span className="font-mono text-xs">{path}</span>{' '}
            {mode === 'tags'
              ? t('on each environment, read as a crawler. Differences are highlighted.', 'sur chaque environnement, lue comme un robot. Les différences sont surlignées.')
              : t('on each environment, rendered like the chosen device, with its Web Vitals.', 'sur chaque environnement, rendue comme l’appareil choisi, avec ses Web Vitals.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" className="flex gap-0.5 rounded-lg border border-line bg-bg p-0.5">
            {(
              [
                ['tags', t('Tags and checks', 'Balises et checks')],
                ['visual', t('Visual', 'Visuel')],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={`flex h-7 items-center rounded-md px-3 text-xs font-medium ${mode === id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'tags' && (
            <button onClick={() => void run()} disabled={loading} className={btn}>
              <Icon name="reload" size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? t('Reading…', 'Lecture…') : t('Re-read', 'Relire')}
            </button>
          )}
        </div>
      </div>
      {mode === 'visual' && targets.length >= 2 && <CompareVisual targets={targets} />}
      {targets.length < 2 && <p className="m-0 text-faint">
          {t(
            'You need at least two environments: open your local server, or wait for a preview to be ready.',
            'Il faut au moins deux environnements : ouvre ton serveur local, ou attends une preview prête.',
          )}
        </p>}
      {mode === 'tags' && columns && (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-36 border-b border-line-soft px-3 py-2.5 text-left font-normal text-faint" />
                {columns.map((c) => (
                  <th key={c.env} className="border-b border-l border-line-soft px-3 py-2.5 text-left align-top font-normal">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                      <Dot className={ENV_DOT[c.env]} />
                      {c.label}
                      {c.score && (
                        <span className="ml-auto font-mono text-xs font-normal text-muted">
                          {c.score.passed}/{c.score.total}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">{c.url}</span>
                    {c.error ? <span className="text-err">{c.error}</span> : c.status !== 200 && <span className="text-err">HTTP {c.status}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vals = columns.map((c) => c.values[r] ?? null);
                const differ = new Set(vals.map((v) => v ?? '∅')).size > 1;
                return (
                  <tr key={r} className={differ ? 'bg-warn/[0.06]' : ''}>
                    <td className="border-t border-line-soft px-3 py-2 align-top font-mono text-[11.5px] text-faint">
                      {differ && <span className="mr-1.5 text-warn">≠</span>}
                      {ROW_LABEL[r] ?? r}
                    </td>
                    {vals.map((v, i) => (
                      <td key={columns[i]!.env} className={`border-t border-l border-line-soft px-3 py-2 align-top break-words ${v ? 'text-fg' : 'text-ghost'}`}>
                        {v ?? t('missing', 'absent')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
