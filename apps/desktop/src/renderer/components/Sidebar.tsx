import { t } from '@kinglet/core';
import { useStore, type Section } from '../store';
import { Icon, type IconName } from './Icons';

type Item = { id: string; label: string; icon: IconName; on: boolean; run: () => void; badge?: { n: number | string; tone: 'err' | 'warn' | 'ok' | 'clay' } | null; hint?: string };

const TONE = {
  err: 'bg-err/15 text-err',
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
  clay: 'bg-[rgba(217,119,87,0.16)] text-[#d97757]',
} as const;

/**
 * Icon rail, no text (the name shows on hover). On top, what you use all along while developing
 * (devices, deployments, changes); below the line, what you check before publishing.
 * Claude is not here: its column sits on the right edge of the window (Ctrl J folds it).
 */
export function Rail() {
  const s = useStore();
  const { section, setSection, share, report } = s;
  const shareErrors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const onDevices = section === 'apercu';
  const go = (id: Section) => () => setSection(id);
  const left = report ? report.score.total - report.score.passed : 0;
  const fresh = s.settings.activeId ? (s.artifacts[s.settings.activeId] ?? []).filter((a) => !a.seen).length : 0;
  const secErrors = s.security?.checks.filter((c) => c.status === 'error').length ?? 0;
  const secWarnings = s.security?.checks.filter((c) => c.status === 'warning').length ?? 0;

  const primary: Item[] = [
    { id: 'apercu', label: t('Devices', 'Appareils'), icon: 'devices', on: onDevices, run: go('apercu') },
    { id: 'deploiements', label: t('Deployments', 'Déploiements'), icon: 'deploy', on: section === 'deploiements', run: go('deploiements') },
    { id: 'changes', label: t('Changes (git diff)', 'Modifications (git diff)'), icon: 'branch', on: section === 'changes', run: go('changes') },
    { id: 'artifacts', label: t('Claude’s artifacts', 'Artifacts de Claude'), icon: 'artifact', on: section === 'artifacts', run: go('artifacts'), badge: fresh ? { n: fresh, tone: 'clay' } : null },
  ];
  const secondary: Item[] = [
    { id: 'page', label: 'Page', icon: 'doc', on: section === 'page', run: go('page') },
    { id: 'partage', label: t('Open Graph previews', 'Aperçus Open Graph'), icon: 'graph', on: section === 'partage', run: go('partage'), badge: shareErrors > 0 ? { n: shareErrors, tone: 'err' } : null },
    {
      id: 'checks',
      label: 'Checks',
     
      icon: 'checkCircle',
      on: section === 'checks',
      run: go('checks'),
      badge: report ? (left ? { n: left, tone: 'warn' } : { n: '✓', tone: 'ok' }) : null,
    },
    {
      id: 'securite',
      label: t('Security', 'Sécurité'),
      icon: 'shield',
      on: section === 'securite',
      run: go('securite'),
      badge: s.security && s.security.url === s.url ? (secErrors ? { n: secErrors, tone: 'err' } : secWarnings ? { n: secWarnings, tone: 'warn' } : { n: '✓', tone: 'ok' }) : null,
    },
    { id: 'comparer', label: t('Compare', 'Comparer'), icon: 'split', on: section === 'comparer', run: go('comparer') },
  ];

  const button = (it: Item) => (
    <button
      key={it.id}
      onClick={it.run}
      aria-current={it.on ? 'page' : undefined}
      aria-label={it.label}
      title={it.hint ? `${it.label} (${it.hint})` : it.label}
      className={`group relative flex size-11 shrink-0 items-center justify-center rounded-[11px] transition-colors ${
        it.on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-faint hover:bg-active/60 hover:text-fg'
      }`}
    >
      {it.on && <span aria-hidden="true" className="absolute top-1/2 -left-[10px] h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-fg" />}
      <Icon name={it.icon} size={21} stroke={1.7} />
      {it.badge && (
        <span className={`absolute -top-[3px] -right-[3px] flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9.5px] leading-none font-semibold ring-2 ring-chrome ${TONE[it.badge.tone]}`}>{it.badge.n}</span>
      )}
    </button>
  );

  return (
    <nav aria-label="Sections" className="flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-line-soft bg-chrome py-2.5">
      {primary.map(button)}
      <span aria-hidden="true" className="my-1 h-px w-7 shrink-0 bg-line" />
      {secondary.map(button)}
      <span className="flex-1" />
      {button({ id: 'reglages', label: t('Settings', 'Réglages'), icon: 'settings', on: section === 'reglages', run: go('reglages'), hint: 'Ctrl ,' })}
    </nav>
  );
}
