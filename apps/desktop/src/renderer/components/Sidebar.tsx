import { t } from '@parakeet/core';
import { useStore, type Panel, type Section } from '../store';
import { Icon, type IconName } from './Icons';

type Item = { id: string; label: string; icon: IconName; on: boolean; run: () => void; badge?: React.ReactNode; hint?: string; claude?: boolean };

/**
 * Narrow icon rail. On top, what you use all along while developing (devices, console, deployments);
 * below, smaller, what you check before publishing (page, share, checks, compare).
 */
export function Rail() {
  const s = useStore();
  const { section, setSection, share, report, logs, panel, consoleOpen, togglePanel, toggleConsole } = s;
  const shareErrors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const consoleErrors = logs.filter((l) => l.level === 'error').length;
  const onDevices = section === 'apercu';
  const go = (id: Section) => () => setSection(id);
  const open = (p: Panel) => () => togglePanel(p);

  const primary: Item[] = [
    { id: 'apercu', label: t('Devices', 'Appareils'), icon: 'eye', on: onDevices, run: go('apercu') },
    { id: 'console', label: 'Console', icon: 'terminal', on: onDevices && consoleOpen, run: () => toggleConsole(), badge: consoleErrors > 0 ? <span className="text-err">{consoleErrors}</span> : null },
    { id: 'deploiements', label: t('Deployments', 'Déploiements'), icon: 'tri', on: section === 'deploiements', run: go('deploiements') },
    ...(s.settings.claudePanel ? [{ id: 'claude', label: 'Claude', icon: 'spark' as IconName, on: onDevices && panel === 'claude', run: open('claude'), hint: 'Ctrl J', claude: true }] : []),
  ];
  const secondary: Item[] = [
    { id: 'page', label: 'Page', icon: 'page', on: onDevices && panel === 'page', run: open('page') },
    { id: 'partage', label: t('Share', 'Partage'), icon: 'share', on: section === 'partage', run: go('partage'), badge: shareErrors > 0 ? <span className="text-err">{shareErrors}</span> : null },
    {
      id: 'checks',
      label: 'Checks',
      icon: 'check',
      on: (onDevices && panel === 'checks') || section === 'checks',
      run: open('checks'),
      badge: report ? <span className={report.score.passed === report.score.total ? 'text-ok' : 'text-ghost'}>{report.score.total - report.score.passed || '✓'}</span> : null,
    },
    { id: 'comparer', label: t('Compare', 'Comparer'), icon: 'cols', on: section === 'comparer', run: go('comparer') },
  ];

  const button = (it: Item, small = false) => (
    <button
      key={it.id}
      onClick={it.run}
      aria-current={it.on ? 'page' : undefined}
      aria-label={it.label}
      title={it.hint ? `${it.label} (${it.hint})` : it.label}
      className={`relative flex shrink-0 items-center justify-center ${small ? 'size-8 rounded-lg' : 'size-10 rounded-[9px]'} ${
        it.claude
          ? it.on
            ? 'bg-[rgba(217,119,87,0.14)] text-[#d97757] shadow-[inset_0_0_0_1px_rgba(217,119,87,0.35)]'
            : 'text-[#d97757]/80 hover:bg-[rgba(217,119,87,0.1)] hover:text-[#d97757]'
          : it.on
            ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]'
            : small ? 'text-ghost hover:bg-active/60 hover:text-fg' : 'text-faint hover:bg-active/60 hover:text-fg'
      }`}
    >
      <Icon name={it.icon} size={small ? 14 : 16} />
      {it.claude && s.settings.activeId && s.chats[s.settings.activeId]?.running && <span aria-hidden="true" className="claude-dot absolute top-[6px] right-[6px] size-1.5 rounded-full bg-[#d97757]" />}
      {it.badge && <span className="absolute top-[2px] right-[2px] font-mono text-[9px] leading-none">{it.badge}</span>}
    </button>
  );

  return (
    <nav aria-label="Sections" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line-soft bg-chrome py-2.5">
      {primary.map((it) => button(it))}
      <span aria-hidden="true" className="mt-2 mb-1.5 h-px w-6 bg-line" />
      {secondary.map((it) => button(it, true))}
      <span className="flex-1" />
      {button({ id: 'reglages', label: t('Settings', 'Réglages'), icon: 'gear', on: section === 'reglages', run: go('reglages'), hint: 'Ctrl ,' })}
    </nav>
  );
}
