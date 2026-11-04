import { t } from '@parakeet/core';
import { useStore, type Section } from '../store';
import { Icon, type IconName } from './Icons';

const items = (): { id: Section; label: string; icon: IconName }[] => [
  { id: 'apercu', label: t('Devices', 'Aperçu'), icon: 'eye' },
  { id: 'partage', label: t('Share', 'Partage'), icon: 'share' },
  { id: 'comparer', label: t('Compare', 'Comparer'), icon: 'cols' },
  { id: 'deploiements', label: t('Deployments', 'Déploiements'), icon: 'tri' },
  { id: 'checks', label: 'Checks', icon: 'check' },
];

/** Narrow icon rail: the sections of the active project. */
export function Rail() {
  const { section, setSection, share, report } = useStore();
  const errors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;

  const item = (it: { id: Section; label: string; icon: IconName }, hint?: string) => {
    const on = section === it.id;
    const badge =
      it.id === 'partage' && errors > 0 ? (
        <span className="text-err">{errors}</span>
      ) : it.id === 'checks' && report ? (
        <span className={report.score.passed === report.score.total ? 'text-ok' : 'text-ghost'}>{report.score.total - report.score.passed || '✓'}</span>
      ) : null;
    return (
      <button
        key={it.id}
        onClick={() => setSection(it.id)}
        aria-current={on ? 'page' : undefined}
        aria-label={it.label}
        title={hint ? `${it.label} (${hint})` : it.label}
        className={`relative flex size-10 shrink-0 items-center justify-center rounded-[9px] ${on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-faint hover:bg-active/60 hover:text-fg'}`}
      >
        <Icon name={it.icon} size={16} />
        {badge && <span className="absolute top-[3px] right-[3px] font-mono text-[9px] leading-none">{badge}</span>}
      </button>
    );
  };

  return (
    <nav aria-label="Sections" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line-soft bg-chrome py-2.5">
      {items().map((it) => item(it))}
      <span className="flex-1" />
      {item({ id: 'reglages', label: t('Settings', 'Réglages'), icon: 'gear' }, 'Ctrl ,')}
    </nav>
  );
}
