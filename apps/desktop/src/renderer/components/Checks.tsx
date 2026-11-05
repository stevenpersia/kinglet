import { CHECK_GROUPS, score, t, type CheckResult, type CheckStatus } from '@kinglet/core';
import { Dot } from './Icons';

export const STATUS_DOT: Record<CheckStatus, string> = {
  ok: 'bg-ok',
  info: 'bg-local',
  warning: 'bg-warn',
  error: 'bg-err',
  skip: 'bg-ghost',
};
const statusLabel = (): Record<CheckStatus, string> => ({
  ok: 'OK',
  info: t('Expected here', 'Normal ici'),
  warning: t('Needs work', 'À améliorer'),
  error: t('Problem', 'Problème'),
  skip: t('Not measured', 'Non mesuré'),
});
const ORDER: Record<CheckStatus, number> = { error: 0, warning: 1, info: 2, ok: 3, skip: 4 };

/** Checks grouped by family (SEO, Partage, Mobile, Technique), problems first. */
export function CheckGroups({ checks, compact = false, onAsk }: { checks: CheckResult[]; compact?: boolean; onAsk?: (c: CheckResult) => void }) {
  return (
    <div className={compact ? 'flex flex-col gap-3' : 'grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4'}>
      {CHECK_GROUPS.map((g) => {
        const items = checks.filter((c) => c.group === g.id).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
        if (!items.length) return null;
        const s = score(items);
        return (
          <section key={g.id} aria-label={g.label} className="h-fit overflow-hidden rounded-[10px] border border-line bg-card">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="font-semibold">{g.label}</span>
              <span className={`font-mono text-xs ${s.passed === s.total ? 'text-ok' : 'text-muted'}`}>
                {s.passed}/{s.total}
              </span>
            </div>
            <ul className="border-t border-line-soft">
              {items.map((c) => (
                <li key={c.id} className="group flex gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                  <Dot className={`mt-1.5 ${STATUS_DOT[c.status]}`} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className={c.status === 'skip' ? 'text-faint' : 'text-fg'}>
                      {c.label}
                      <span className="sr-only"> : {statusLabel()[c.status]}</span>
                    </span>
                    {(!compact || c.status !== 'ok') && <span className="text-xs leading-snug break-words text-muted">{c.detail}</span>}
                  </div>
                  {onAsk && (c.status === 'error' || c.status === 'warning') && (
                    <button
                      onClick={() => onAsk(c)}
                      title={t('Ask Claude to fix it', 'Demander à Claude de corriger')}
                      className="ml-auto h-6 shrink-0 self-start rounded-md border border-[rgba(217,119,87,0.3)] px-2 text-[11px] font-medium text-[#d97757] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[rgba(217,119,87,0.1)]"
                    >
                      Claude
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
