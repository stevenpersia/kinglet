import type { Issue } from '@parakeet/core';
import { useStore, type InspectorTab } from '../store';
import { Dot } from './Icons';

const formatBytes = (b: number) => (b < 1024 ? `${b} o` : `${Math.round(b / 1024)} Ko`);
const sevColor = { error: 'bg-err', warning: 'bg-warn' } as const;

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length)
    return (
      <li className="flex gap-2.5 px-3 py-2.5">
        <Dot className="mt-1.5 bg-ok" />
        <span className="text-xs text-muted">Toutes les balises de partage sont en place.</span>
      </li>
    );
  return (
    <>
      {issues.map((i) => (
        <li key={i.id} className="flex gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
          <Dot className={`mt-1.5 ${sevColor[i.severity]}`} />
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs">{i.tag}</span>
            <span className="text-xs leading-snug text-muted">{i.message}</span>
          </div>
        </li>
      ))}
    </>
  );
}

export function LinkCard() {
  const share = useStore((s) => s.share);
  if (!share) return null;
  const { meta, image } = share;
  return (
    <div className="flex overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="w-[84px] shrink-0 bg-raised bg-cover bg-center" style={image?.ok && meta.ogImageUrl ? { backgroundImage: `url("${meta.ogImageUrl}")` } : undefined} />
      <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-xs font-semibold">{meta.og['title'] ?? meta.title ?? '—'}</span>
        <span className="truncate text-xs text-muted">{meta.og['description'] ?? meta.description ?? ''}</span>
        {meta.og['site_name'] ? <span className="font-mono text-[11px] text-faint">{meta.og['site_name']}</span> : <span className="font-mono text-[11px] text-err">og:site_name absent</span>}
      </div>
    </div>
  );
}

function Count({ n, max }: { n: number; max: number }) {
  return <span className={`font-mono text-[11px] ${n === 0 || n > max ? 'text-warn' : 'text-ok'}`}>{`${n} / ${max}`}</span>;
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex gap-3 border-t border-line-soft px-3 py-2 first:border-t-0">
      <span className="w-24 shrink-0 font-mono text-[11.5px] text-faint">{k}</span>
      <span className={`min-w-0 text-xs break-all ${v ? 'text-fg' : 'text-err'}`}>{v ?? 'absent'}</span>
    </div>
  );
}

function PageTab() {
  const share = useStore((s) => s.share);
  if (!share) return null;
  const { meta } = share;
  const title = meta.title ?? '';
  const desc = meta.description ?? '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="label">Title</span>
          <Count n={title.length} max={60} />
        </div>
        <span className="text-[15px] leading-snug font-semibold tracking-[-0.01em]">{title || '— absent —'}</span>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="label">Description</span>
          <Count n={desc.length} max={160} />
        </div>
        <span className="leading-relaxed text-muted">{desc || '— absente —'}</span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        <Row k="lang" v={meta.lang} />
        <Row k="viewport" v={meta.viewport} />
        <Row k="canonical" v={meta.canonical} />
        <Row k="theme-color" v={meta.themeColor} />
        <Row k="icônes" v={meta.icons.length ? meta.icons.map((u) => u.split('/').pop()).join(', ') : null} />
      </div>
    </div>
  );
}

function ShareTab() {
  const share = useStore((s) => s.share);
  if (!share) return null;
  const { meta, image, issues } = share;
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        <div className="flex justify-between px-3 py-2.5 font-semibold">
          <span>Partage</span>
          <span className="font-mono text-xs font-normal text-muted">
            {issues.length ? `${errors} erreur${errors > 1 ? 's' : ''} · ${issues.length - errors} alerte${issues.length - errors > 1 ? 's' : ''}` : 'tout est bon'}
          </span>
        </div>
        <ul className="border-t border-line-soft">
          <IssueList issues={issues} />
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">Aperçu du lien · WhatsApp</span>
        <LinkCard />
        <span className="font-mono text-[11px] leading-relaxed text-faint">
          Lu comme {meta.fetchedAs} · HTTP {meta.status} · {meta.durationMs} ms
          {image?.ok ? ` · image ${image.width}×${image.height}, ${formatBytes(image.bytes ?? 0)}` : ''}
        </span>
      </div>
    </div>
  );
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'partage', label: 'Partage' },
];

export function Inspector() {
  const { inspectorTab, setInspectorTab, share, shareError, status, error, url } = useStore();
  const errors = share?.issues.filter((i) => i.severity === 'error').length ?? 0;
  let body;
  if (!url) body = <p className="text-faint">Saisis l’adresse de ton serveur de dev en haut, ou juste son port (ex. 3000).</p>;
  else if (status === 'failed') body = <p className="text-faint">{error}</p>;
  else if (shareError) body = <p className="text-faint">Lecture des balises impossible : {shareError}</p>;
  else if (!share) body = <p className="text-faint">Lecture des balises…</p>;
  else body = inspectorTab === 'page' ? <PageTab /> : <ShareTab />;

  return (
    <aside aria-label="Inspecteur" className="flex w-[340px] shrink-0 flex-col border-l border-line-soft bg-chrome">
      <div role="tablist" className="flex gap-0.5 border-b border-line-soft px-2.5 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={inspectorTab === t.id}
            onClick={() => setInspectorTab(t.id)}
            className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs ${inspectorTab === t.id ? 'border-line-strong bg-active font-medium text-fg' : 'border-transparent text-muted hover:text-fg'}`}
          >
            {t.label}
            {t.id === 'partage' && errors > 0 && <span className="font-mono text-err">{errors}</span>}
          </button>
        ))}
        <span title="Arrive en phase 2" className="inline-flex h-[26px] cursor-default items-center px-2.5 text-xs text-ghost">Checks</span>
        <span title="Arrive en phase 4" className="inline-flex h-[26px] cursor-default items-center px-2.5 text-xs text-ghost">MCP</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  );
}
