import { t } from '@parakeet/core';
import { activePresets, useStore } from '../store';
import { CheckGroups } from './Checks';
import { askCheck } from './askCheck';
import { Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <main className="stage-bg flex flex-1 flex-col items-center justify-center gap-3">
      <p className="m-0 text-faint">{text}</p>
      {action}
    </main>
  );
}

export function ChecksPage() {
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
    <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
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
    </main>
  );
}
