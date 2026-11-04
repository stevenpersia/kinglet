import { useStore, type Section } from '../store';
import { Icon, type IconName } from './Icons';

const ITEMS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'apercu', label: 'Aperçu', icon: 'eye' },
  { id: 'partage', label: 'Partage', icon: 'share' },
  { id: 'comparer', label: 'Comparer', icon: 'cols' },
  { id: 'deploiements', label: 'Déploiements', icon: 'tri' },
  { id: 'checks', label: 'Checks', icon: 'check' },
  { id: 'reglages', label: 'Réglages', icon: 'gear' },
];

export function Sidebar() {
  const { section, setSection, share, url } = useStore();
  const errors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;
  let path = '/';
  try {
    if (url) path = new URL(url).pathname;
  } catch {
    /* keep / */
  }

  return (
    <nav aria-label="Sections" className="flex w-[212px] shrink-0 flex-col gap-px border-r border-line-soft bg-chrome px-2 py-3">
      {ITEMS.map((it) => {
        const on = section === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setSection(it.id)}
            aria-current={on ? 'page' : undefined}
            className={`flex h-8 items-center gap-2.5 rounded-ui px-2.5 text-left ${on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
          >
            <Icon name={it.icon} className={on ? 'text-fg' : 'text-faint'} />
            <span className="flex-1">{it.label}</span>
            {it.id === 'partage' && errors > 0 && <span className="font-mono text-[10.5px] text-err">{errors}</span>}
            {it.id === 'reglages' && <span className="font-mono text-[10.5px] text-ghost">Ctrl ,</span>}
          </button>
        );
      })}

      <div className="label mx-2.5 mt-5 mb-1.5">Page</div>
      <div className="flex h-7 items-center justify-between rounded-md bg-active px-2.5 font-mono text-xs text-fg">
        <span className="truncate">{path}</span>
      </div>
      <p className="mx-2.5 mt-2 text-[11.5px] leading-relaxed text-faint">La liste des pages du site arrivera avec l’exploration (phase 2).</p>
    </nav>
  );
}
