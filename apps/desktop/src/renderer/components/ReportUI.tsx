import { t } from '@kinglet/core';
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icons';

/** Building blocks of the report pages (Page, Checks, Security): one look for all three. */

export type Tone = 'ok' | 'info' | 'warning' | 'error' | 'skip';
export const TONE_DOT: Record<Tone, string> = { ok: 'bg-ok', info: 'bg-local', warning: 'bg-warn', error: 'bg-err', skip: 'bg-ghost' };
export const TONE_RANK: Record<Tone, number> = { error: 0, warning: 1, info: 2, ok: 3, skip: 4 };

export function ReportHeader({ icon, title, url, subtitle, actions }: { icon: IconName; title: string; url: string; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 flex items-center gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          <Icon name={icon} size={18} />
          {title}
        </h1>
        <p className="m-0 mt-1.5 text-muted">
          <span className="font-mono text-xs text-fg">{url}</span> · {subtitle}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const reRunButton = 'flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';
export const askAllButton = 'h-8 rounded-ui bg-[#d97757] px-3 font-semibold text-[#1a120b] hover:brightness-110';

export type SummaryCell = { label: string; tone: Tone; value: ReactNode };

/** One line of cells, all built the same: a label with its dot, then a value. The first is the score. */
export function SummaryBand({ cells }: { cells: SummaryCell[] }) {
  return (
    <section aria-label={t('Summary', 'Résumé')} className="grid overflow-hidden rounded-xl border border-line bg-card [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex min-w-0 flex-col gap-2 px-4 py-4 ${i === 0 ? 'border-r border-line' : 'border-r border-line-soft last:border-r-0'}`}>
          <span className="flex items-center gap-2 text-muted">
            <span className={`size-[7px] shrink-0 rounded-full ${TONE_DOT[c.tone]}`} />
            <span className="truncate">{c.label}</span>
          </span>
          <span className="truncate text-[14.5px] font-semibold">{c.value}</span>
        </div>
      ))}
    </section>
  );
}

/** "Nothing to fix" in green, with the score. */
export function AllClear({ title, text, score }: { title: string; text: string; score: ReactNode }) {
  return (
    <section aria-label={t('Summary', 'Résumé')} className="flex items-center gap-5 rounded-xl border border-ok/25 bg-ok/[0.05] px-6 py-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
        <Icon name="check" size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{title}</span>
        <span className="text-muted">{text}</span>
      </div>
      <span className="font-mono text-[26px] font-medium">{score}</span>
    </section>
  );
}

export function ScoreValue({ passed, total, tone }: { passed: number; total: number; tone: Tone }) {
  return (
    <>
      <span className={`font-mono ${tone === 'error' ? 'text-err' : tone === 'warning' ? 'text-warn' : 'text-ok'}`}>{passed}</span>
      <span className="font-mono text-ghost">/{total}</span>
    </>
  );
}

export type Problem = { id: string; tone: 'error' | 'warning'; label: string; family: string; detail: string; mono?: boolean; evidence?: ReactNode };

/** "To fix": one row per problem, the first one open with its evidence; Ask Claude on each. */
export function ProblemList({ title, problems, onAsk }: { title: string; problems: Problem[]; onAsk?: (p: Problem) => void }) {
  const [opened, setOpened] = useState<string | null>(null);
  const open = opened ?? problems[0]?.id ?? null;
  if (!problems.length) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="label m-0">{`${title} · ${problems.length}`}</h2>
      <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-card p-0">
        {problems.map((p) => {
          const isOpen = open === p.id;
          return (
            <li key={p.id} className={`border-t border-line-soft first:border-t-0 ${isOpen ? (p.tone === 'error' ? 'bg-err/[0.035]' : 'bg-warn/[0.03]') : ''}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setOpened(isOpen ? '' : p.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className={`shrink-0 rounded-[5px] px-2 py-0.5 font-mono text-[10.5px] ${p.tone === 'error' ? 'bg-err/12 text-err' : 'bg-warn/12 text-warn'}`}>
                    {p.tone === 'error' ? t('PROBLEM', 'PROBLÈME') : t('IMPROVE', 'À AMÉLIORER')}
                  </span>
                  <span className={`shrink-0 text-[13.5px] font-semibold ${p.mono ? 'font-mono text-[12.5px]' : ''}`}>{p.label}</span>
                  <span className="shrink-0 text-faint">{p.family}</span>
                  <span className={`min-w-0 flex-1 truncate text-right text-[12.5px] text-muted ${isOpen ? 'invisible' : ''}`}>{p.detail}</span>
                  <Icon name="chevrons" size={13} className="shrink-0 text-ghost" />
                </button>
                {onAsk && (
                  <button onClick={() => onAsk(p)} className="h-7 shrink-0 rounded-md border border-[rgba(217,119,87,0.3)] px-2.5 text-xs font-medium text-[#f0a07f] hover:bg-[rgba(217,119,87,0.08)]">
                    {t('Ask Claude', 'Demander à Claude')}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="flex flex-col gap-3 pr-4 pb-4 pl-4 sm:pl-[106px]">
                  <p className="m-0 text-[12.5px] text-[#c4c4cc]">{p.detail}</p>
                  {p.evidence}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type PassedItem = { id: string; label: string; value: string; tone: 'ok' | 'info'; mono?: boolean };

/** What passed, one short line each with its value. */
export function PassedBlock({ title, items }: { title: string; items: PassedItem[] }) {
  if (!items.length) return null;
  const ok = items.filter((c) => c.tone === 'ok').length;
  return (
    <section aria-label={title} className="h-fit overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between px-4 py-3 font-semibold">
        {title}
        <span className="font-mono text-xs font-normal text-ok">
          {ok}/{items.length}
        </span>
      </div>
      <ul className="m-0 list-none border-t border-line-soft p-0">
        {items.map((c) => (
          <li key={c.id} className="grid grid-cols-[14px_minmax(0,9.5rem)_minmax(0,1fr)] items-baseline gap-2.5 border-t border-line-soft px-4 py-2.5 first:border-t-0">
            <span className={c.tone === 'ok' ? 'text-ok' : 'text-local'}>{c.tone === 'ok' ? '✓' : 'i'}</span>
            <span className="truncate">{c.label}</span>
            <span className={`truncate text-xs text-faint ${c.mono ? 'font-mono text-[11.5px]' : ''}`} title={c.value}>
              {c.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PassedGrid({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section aria-label={title ?? t('Passed', 'Réussi')} className="flex flex-col gap-2.5">
      {title && <h2 className="label m-0">{title}</h2>}
      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">{children}</div>
    </section>
  );
}

export function NotChecked({ labels, reason }: { labels: string[]; reason?: string }) {
  if (!labels.length) return null;
  return (
    <p className="m-0 text-xs leading-relaxed text-ghost">
      {t('Not measured here: ', 'Non mesuré ici : ')}
      {labels.join(', ')}.{reason ? ` ${reason}` : ''}
    </p>
  );
}

export function EmptyReport({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <main className="stage-bg flex flex-1 flex-col items-center justify-center gap-3">
      <p className="m-0 text-faint">{text}</p>
      {action}
    </main>
  );
}
