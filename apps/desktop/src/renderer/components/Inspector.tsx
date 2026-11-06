import { EmulationPanel, ExportPanel, FormsPanel } from './Stage';
import { t, type Issue } from '@kinglet/core';
import { useStore } from '../store';
import { Dot } from './Icons';
import { FeedbackPanel } from './FeedbackPanel';

const sevColor = { error: 'bg-err', warning: 'bg-warn' } as const;

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length)
    return (
      <li className="flex gap-2.5 px-3 py-2.5">
        <Dot className="mt-1.5 bg-ok" />
        <span className="text-xs text-muted">{t('All share tags are in place.', 'Toutes les balises de partage sont en place.')}</span>
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
        <span className="font-mono text-[11px] text-faint">{new URL(meta.finalUrl).host}</span>
      </div>
    </div>
  );
}

/** The panel docked next to the devices: Feedback, or one of the tools (Emulation, Forms, Export). */
export function SidePanel() {
  const panel = useStore((s) => s.panel);
  if (panel === 'feedback') return <FeedbackPanel />;
  if (panel === 'emulation') return <EmulationPanel />;
  if (panel === 'forms') return <FormsPanel />;
  if (panel === 'export') return <ExportPanel />;
  return null;
}
