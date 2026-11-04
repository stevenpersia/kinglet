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

function PageList() {
  const { url, pages, crawling, crawlSite, navigate } = useStore();
  let current: URL | null = null;
  try {
    current = url ? new URL(url) : null;
  } catch {
    /* no page */
  }
  const list = pages.length ? pages : current ? [{ url: current.toString(), path: current.pathname, status: null, title: null }] : [];
  return (
    <>
      <div className="mx-2.5 mt-5 mb-1.5 flex items-center justify-between">
        <span className="label">Pages{pages.length ? ` · ${pages.length}` : ''}</span>
        <button
          onClick={() => void crawlSite(true)}
          disabled={!url || crawling}
          title="Explorer à nouveau le site"
          aria-label="Explorer à nouveau le site"
          className="rounded p-0.5 text-ghost hover:bg-active hover:text-fg disabled:opacity-50"
        >
          <Icon name="reload" size={12} className={crawling ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
        {list.map((p) => {
          const on = current?.pathname === p.path;
          const dot = p.status == null ? 'bg-ghost' : p.status < 300 ? 'bg-ok' : p.status < 400 ? 'bg-warn' : 'bg-err';
          return (
            <button
              key={p.url}
              onClick={() => current && void navigate(new URL(p.path, current.origin).toString())}
              title={p.title ?? p.path}
              className={`flex h-7 shrink-0 items-center justify-between gap-2 rounded-md px-2.5 text-left font-mono text-xs ${on ? 'bg-active text-fg' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
            >
              <span className="truncate">{p.path}</span>
              {p.status != null && p.status >= 300 ? <span className="shrink-0 text-[10.5px] text-err">{p.status}</span> : <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />}
            </button>
          );
        })}
        {crawling && <p className="mx-2.5 mt-1 text-[11.5px] text-faint">Exploration du site…</p>}
        {!url && <p className="mx-2.5 mt-1 text-[11.5px] text-faint">Les pages apparaîtront ici.</p>}
      </div>
    </>
  );
}

export function Sidebar() {
  const { section, setSection, share, report } = useStore();
  const errors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;

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
            {it.id === 'checks' && report && (
              <span className={`font-mono text-[10.5px] ${report.score.passed === report.score.total ? 'text-ok' : 'text-ghost'}`}>
                {report.score.passed}/{report.score.total}
              </span>
            )}
            {it.id === 'reglages' && <span className="font-mono text-[10.5px] text-ghost">Ctrl ,</span>}
          </button>
        );
      })}

      <PageList />
    </nav>
  );
}
