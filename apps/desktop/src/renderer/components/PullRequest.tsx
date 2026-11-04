import { t } from '@parakeet/core';
import { useEffect, useState } from 'react';
import type { PullRequest } from '../../shared/types';
import { api, projectVercel, useStore } from '../store';

/** Pull requests of the active project's branches (when GitHub is connected), refreshed every minute. */
export function usePullRequests(): Record<string, PullRequest> {
  const s = useStore();
  const vercel = projectVercel(s);
  const repo = vercel.project?.repo ?? null;
  const branches = [...new Set(vercel.deployments.filter((d) => !d.production && d.branch).map((d) => d.branch!))].sort().join('\n');
  const connected = !!s.github?.connected;
  const [prs, setPrs] = useState<Record<string, PullRequest>>({});
  useEffect(() => {
    if (!connected || !repo || !branches) return setPrs({});
    let live = true;
    const load = () => void api().github.pullRequests(repo, branches.split('\n')).then((r) => live && setPrs(r));
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [connected, repo, branches]);
  return prs;
}

const STATE = () =>
  ({
    open: { label: t('open', 'ouverte'), cls: 'text-ok border-ok/40' },
    draft: { label: t('draft', 'brouillon'), cls: 'text-muted border-line-strong' },
    merged: { label: t('merged', 'mergée'), cls: 'text-[#b69cf2] border-[#b69cf2]/40' },
    closed: { label: t('closed', 'fermée'), cls: 'text-faint border-line-strong' },
  }) as const;

/** "#12 open · ✓ 3/3": opens the PR on GitHub. */
export function PrBadge({ pr }: { pr: PullRequest }) {
  const st = STATE()[pr.state];
  const ci = pr.checks;
  return (
    <span
      role="link"
      tabIndex={0}
      title={`${pr.title}\n${pr.url}`}
      onClick={(e) => {
        e.stopPropagation();
        api().openExternal(pr.url);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          api().openExternal(pr.url);
        }
      }}
      className={`inline-flex h-[18px] shrink-0 cursor-pointer items-center gap-1 rounded border px-1.5 font-mono text-[10.5px] hover:bg-active ${st.cls}`}
    >
      #{pr.number} <span className="font-sans">{st.label}</span>
      {ci && (
        <span className={ci.state === 'success' ? 'text-ok' : ci.state === 'failure' ? 'text-err' : 'text-warn'}>
          · {ci.state === 'success' ? '✓' : ci.state === 'failure' ? '✕' : '…'} {ci.passed}/{ci.total}
        </span>
      )}
    </span>
  );
}
