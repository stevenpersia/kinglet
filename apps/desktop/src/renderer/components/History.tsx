import { formatBudgetValue, locale, t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { HistoryEntry, VercelDeployment } from '../../shared/types';
import { activeProject, patchProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';
import { Icon } from './Icons';

type Metric = { id: string; label: string; get: (e: HistoryEntry) => number | null; fmt: (v: number) => string; good: (v: number) => boolean; higherIsBetter?: boolean };

const METRICS = (): Metric[] => [
  { id: 'score', label: 'Checks', get: (e) => (e.score ? (e.score.passed / Math.max(1, e.score.total)) * 100 : null), fmt: (v) => `${Math.round(v)}${t('%', ' %')}`, good: (v) => v >= 90, higherIsBetter: true },
  { id: 'security', label: t('Security', 'Sécurité'), get: (e) => (e.security ? (e.security.passed / Math.max(1, e.security.total)) * 100 : null), fmt: (v) => `${Math.round(v)}${t('%', ' %')}`, good: (v) => v >= 90, higherIsBetter: true },
  { id: 'lcp', label: 'LCP', get: (e) => e.lcpMs, fmt: (v) => formatBudgetValue('lcp', v), good: (v) => v <= 2500 },
  { id: 'cls', label: 'CLS', get: (e) => e.cls, fmt: (v) => formatBudgetValue('cls', v), good: (v) => v <= 0.1 },
  { id: 'weight', label: t('Weight', 'Poids'), get: (e) => (e.bytes == null ? null : e.bytes / 1024), fmt: (v) => formatBudgetValue('weight', v), good: (v) => v <= 1000 },
];

/** A small line of the last values, newest on the right. */
function Spark({ values, good }: { values: (number | null)[]; good: (v: number) => boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return <div className="h-10" />;
  const w = 180;
  const h = 40;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 6) + 3;
  const y = (v: number) => (max === min ? h / 2 : h - 4 - ((v - min) / (max - min)) * (h - 8));
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="block">
      <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="#8ab4f8" strokeWidth="1.5" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 3 : 1.6} fill={good(p.v) ? '#7ee2a8' : '#f28b82'} />
      ))}
    </svg>
  );
}

/** Score, Web Vitals and weight of each deployment measured: the trend, then the list. */
export function HistoryCard({ projectId, deployments }: { projectId: string; deployments: VercelDeployment[] }) {
  const s = useStore();
  const entries = s.histories[projectId] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!entries) void s.loadHistory(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const measure = async (d: VercelDeployment | null) => {
    setBusy(d?.id ?? 'page');
    setError(null);
    try {
      await api().history.measure(projectId, d ? { url: d.url, deploymentId: d.id, production: d.production, branch: d.branch, commit: d.commitMessage } : undefined);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(null);
    }
  };
  const list = entries ?? [];
  const recent = list.slice(-20);
  const latestReady = deployments.find((d) => d.state === 'READY') ?? null;
  const project = activeProject(s.settings);
  const auto = project?.historyAuto !== false;
  const SOURCE: Record<string, string> = { commit: 'commit', claude: 'Claude', manual: t('by hand', 'à la main'), vercel: 'Vercel' };
  return (
    <section aria-label={t('History', 'Historique')} className="shrink-0 overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex flex-col">
          <span className="flex items-center gap-2 font-semibold">
            <Icon name="chart" size={13} />
            {t('History', 'Historique')}
          </span>
          <span className="text-xs text-muted">
            {deployments.length
              ? t('Each new deployment is measured on a phone, off screen, and the local site after each commit and each finished Claude task. Budgets are checked at the same time.', 'Chaque nouveau déploiement est mesuré sur un téléphone, hors écran, et le site local après chaque commit et chaque tâche de Claude terminée. Les budgets sont vérifiés en même temps.')
              : t('The local site is measured on a phone, off screen, after each commit in the project folder and each finished Claude task. Budgets are checked at the same time.', 'Le site local est mesuré sur un téléphone, hors écran, après chaque commit dans le dossier du projet et chaque tâche de Claude terminée. Les budgets sont vérifiés en même temps.')}
          </span>
          {project && (
            <label className="mt-1 flex items-center gap-1.5 text-[11.5px] text-faint">
              <input type="checkbox" checked={auto} onChange={() => void s.updateSettings(patchProject(s.settings, project.id, { historyAuto: !auto }))} className="accent-[#ededef]" />
              {t('Measure the local site automatically', 'Mesurer le site local automatiquement')}
              {!project.folder && <span className="text-warn">{t(' (no folder: commits are not seen)', ' (pas de dossier : les commits ne sont pas vus)')}</span>}
            </label>
          )}
        </div>
        <button onClick={() => void measure(latestReady)} disabled={!!busy || (!latestReady && !s.url)} className="flex h-7 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium hover:border-line-strong disabled:opacity-50">
          <Icon name="reload" size={11} className={busy ? 'animate-spin' : ''} />
          {busy ? t('Measuring…', 'Mesure…') : latestReady ? t('Measure the latest deployment', 'Mesurer le dernier déploiement') : t('Measure the page shown', 'Mesurer la page affichée')}
        </button>
      </div>
      {error && <p className="m-0 px-4 pb-2 text-xs text-err">{error}</p>}
      {!list.length ? (
        <p className="m-0 border-t border-line-soft px-4 py-3 text-xs text-faint">{t('No measure yet: the next deployment will be the first, or measure one now.', 'Aucune mesure : le prochain déploiement sera le premier, ou mesures-en un maintenant.')}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3 border-t border-line-soft px-4 py-3">
            {METRICS().map((m) => {
              const vals = recent.map(m.get);
              const last = [...vals].reverse().find((v) => v != null) ?? null;
              const prev = [...vals].reverse().filter((v) => v != null)[1] ?? null;
              const delta = last != null && prev != null ? last - prev : null;
              const better = delta == null || delta === 0 ? null : m.higherIsBetter ? delta > 0 : delta < 0;
              return (
                <div key={m.id} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between text-xs text-muted">
                    {m.label}
                    <span className={`font-mono text-[13px] ${last == null ? 'text-faint' : m.good(last) ? 'text-fg' : 'text-err'}`}>
                      {last == null ? '—' : m.fmt(last)}
                      {better != null && <span className={`ml-1 text-[10.5px] ${better ? 'text-ok' : 'text-err'}`}>{better ? '▲' : '▼'}</span>}
                    </span>
                  </span>
                  <Spark values={vals} good={m.good} />
                </div>
              );
            })}
          </div>
          <ul className="m-0 max-h-64 list-none overflow-y-auto border-t border-line-soft p-0">
            {[...list].reverse().map((e) => (
              <li key={`${e.at}-${e.url}`} className="flex items-center gap-3 border-t border-line-soft px-4 py-2 text-xs first:border-t-0">
                <span className="w-28 shrink-0 text-faint">{new Date(e.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.production && <span className="mr-1.5 rounded border border-prod/40 px-1 text-[10px] text-prod">PROD</span>}
                  {e.source && e.source !== 'vercel' && <span className="mr-1.5 rounded border border-line px-1 text-[10px] text-faint">{SOURCE[e.source]}</span>}
                  <span className="font-mono text-fg">{e.branch ?? new URL(e.url).host}</span> <span className="text-muted">{e.commit ?? new URL(e.url).pathname}</span>
                </span>
                {e.error ? (
                  <span className="text-err">{e.error}</span>
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {e.score ? `${e.score.passed}/${e.score.total}` : '—'} · {t('Security', 'Sécurité')} {e.security ? `${e.security.passed}/${e.security.total}` : '—'} · LCP {e.lcpMs != null ? formatBudgetValue('lcp', e.lcpMs) : '—'} · CLS {e.cls != null ? formatBudgetValue('cls', e.cls) : '—'} · {e.bytes != null ? formatBudgetValue('weight', e.bytes / 1024) : '—'}
                  </span>
                )}
                {e.budgetFailures.length > 0 && (
                  <span title={e.budgetFailures.join('\n')} className="shrink-0 rounded bg-[rgba(242,139,130,0.12)] px-1.5 text-[10.5px] text-err">
                    {t(`${e.budgetFailures.length} budget${e.budgetFailures.length > 1 ? 's' : ''}`, `${e.budgetFailures.length} budget${e.budgetFailures.length > 1 ? 's' : ''}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
