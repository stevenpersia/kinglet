import { t } from '@kinglet/core';
import { activePresets, useStore } from '../store';
import { CheckGroups } from './Checks';
import { askCheck } from './askCheck';
import { Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';
import { SiteAuditView } from './SiteAudit';
import { A11yDetails, BudgetsCard } from './PageExtras';

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <main className="stage-bg flex flex-1 flex-col items-center justify-center gap-3">
      <p className="m-0 text-faint">{text}</p>
      {action}
    </main>
  );
}

/** Checks of the page shown, or of the whole site. */
export function ChecksPage() {
  const scope = useStore((s) => s.checksScope);
  const setScope = (checksScope: 'page' | 'site') => useStore.setState({ checksScope });
  const tabs = (
    <div role="tablist" className="flex shrink-0 gap-1 px-6 pt-5">
      {(
        [
          ['page', t('This page', 'Cette page')],
          ['site', t('Whole site', 'Tout le site')],
        ] as const
      ).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={scope === id} onClick={() => setScope(id)} className={`h-8 rounded-md px-3 text-[13px] ${scope === id ? 'bg-active font-medium text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:text-fg'}`}>
          {label}
        </button>
      ))}
    </div>
  );
  if (scope === 'site')
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {tabs}
        <div className="flex flex-col gap-4 p-6 pt-4">
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Site audit', 'Audit du site')}</h1>
          <SiteAuditView />
        </div>
      </main>
    );
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {tabs}
      <PageChecks />
    </div>
  );
}

function PageChecks() {
  const state = useStore();
  const { report, url, analyzing, analyze, status } = state;
  if (!report && url && !analyzing && status === 'loaded')
    return (
      <Empty
        text={t('The checks haven’t run on this page yet.', 'Les checks n’ont pas encore tourné sur cette page.')}
        action={
          <button onClick={() => void analyze(url)} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
            {t('Run the checks', 'Lancer les checks')}
          </button>
        }
      />
    );
  if (!report) return <Empty text={url ? t('Analyzing…', 'Analyse en cours…') : t('Open a site to run the checks.', 'Ouvre un site pour lancer les checks.')} />;
  const devices = activePresets(state);
  const errors = report.checks.filter((c) => c.status === 'error').length;
  const warnings = report.checks.filter((c) => c.status === 'warning').length;
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">Checks</h1>
          <p className="m-0 mt-1 text-muted">
            <span className="font-mono text-xs">{new URL(report.url).pathname}</span> ·{' '}
            {t(
              `HTML read as Google, rendered page measured on ${devices.map((d) => d.label).join(', ')}.`,
              `HTML lu comme Google, page rendue mesurée sur ${devices.map((d) => d.label).join(', ')}.`,
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono text-2xl font-medium tracking-[-0.02em]">
              {report.score.passed}
              <span className="text-faint">/{report.score.total}</span>
            </div>
            <div className="text-xs text-muted">
              {t(
                `${errors} problem${errors > 1 ? 's' : ''} · ${warnings} to improve`,
                `${errors} problème${errors > 1 ? 's' : ''} · ${warnings} à améliorer`,
              )}
            </div>
          </div>
          {errors + warnings > 0 && <CopyButton text={SLASH.checks} label={t('Have Claude fix it', 'Faire corriger par Claude')} done={t('Command copied: paste it into Claude Code ✓', 'Commande copiée : colle-la dans Claude Code ✓')} />}
          <button
            onClick={() => void analyze(report.url, { refreshSite: true })}
            disabled={analyzing}
            className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60"
          >
            <Icon name="reload" size={13} className={analyzing ? 'animate-spin' : ''} />
            {analyzing ? t('Analyzing…', 'Analyse…') : t('Re-run', 'Relancer')}
          </button>
        </div>
      </div>
      <CheckGroups checks={report.checks} onAsk={askCheck()} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4">
        <A11yDetails />
        <BudgetsCard />
      </div>
    </main>
  );
}
