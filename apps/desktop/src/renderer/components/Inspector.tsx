import { EmulationPanel } from './Stage';
import { t, type Issue } from '@kinglet/core';
import { useStore } from '../store';
import { CheckGroups } from './Checks';
import { Dot, Icon } from './Icons';
import { FeedbackPanel } from './FeedbackPanel';
import { askCheck } from './askCheck';
import { HreflangCard, StructuredDataCard } from './PageExtras';

const formatBytes = (b: number) => (b < 1024 ? t(`${b} B`, `${b} o`) : t(`${Math.round(b / 1024)} KB`, `${Math.round(b / 1024)} Ko`));
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

function Count({ n, max }: { n: number; max: number }) {
  return <span className={`font-mono text-[11px] ${n === 0 || n > max ? 'text-warn' : 'text-ok'}`}>{`${n} / ${max}`}</span>;
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex gap-3 border-t border-line-soft px-3 py-2 first:border-t-0">
      <span className="w-24 shrink-0 font-mono text-[11.5px] text-faint">{k}</span>
      <span className={`min-w-0 text-xs break-all ${v ? 'text-fg' : 'text-err'}`}>{v ?? t('missing', 'absent')}</span>
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
        <span className="text-[15px] leading-snug font-semibold tracking-[-0.01em]">{title || t('— missing —', '— absent —')}</span>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="label">Description</span>
          <Count n={desc.length} max={160} />
        </div>
        <span className="leading-relaxed text-muted">{desc || t('— missing —', '— absente —')}</span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        <Row k="lang" v={meta.lang} />
        <Row k="viewport" v={meta.viewport} />
        <Row k="canonical" v={meta.canonical} />
        <Row k="theme-color" v={meta.themeColor} />
        <Row k={t('icons', 'icônes')} v={meta.icons.length ? meta.icons.map((u) => u.split('/').pop()).join(', ') : null} />
      </div>
      <StructuredDataCard />
      <HreflangCard />
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
          <span>{t('Share', 'Partage')}</span>
          <span className="font-mono text-xs font-normal text-muted">
            {issues.length
              ? t(
                  `${errors} error${errors > 1 ? 's' : ''} · ${issues.length - errors} warning${issues.length - errors > 1 ? 's' : ''}`,
                  `${errors} erreur${errors > 1 ? 's' : ''} · ${issues.length - errors} alerte${issues.length - errors > 1 ? 's' : ''}`,
                )
              : t('all good', 'tout est bon')}
          </span>
        </div>
        <ul className="border-t border-line-soft">
          <IssueList issues={issues} />
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">{t('Link preview · WhatsApp', 'Aperçu du lien · WhatsApp')}</span>
        <LinkCard />
        <span className="font-mono text-[11px] leading-relaxed text-faint">
          {t('Fetched as', 'Lu comme')} {meta.fetchedAs} · HTTP {meta.status} · {meta.durationMs} ms
          {image?.ok ? ` · image ${image.width}×${image.height}, ${formatBytes(image.bytes ?? 0)}` : ''}
        </span>
      </div>
    </div>
  );
}

function ChecksBody() {
  const { report, analyzing, analyze, setSection } = useStore();
  if (!report) return null;
  return (
    <div className="flex flex-col gap-4">
      <CheckGroups checks={report.checks} compact onAsk={askCheck()} />
      <div className="flex gap-1.5">
        <button onClick={() => void analyze(report.url, { refreshSite: true })} disabled={analyzing} className="flex h-8 flex-1 items-center justify-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong disabled:opacity-60">
          <Icon name="reload" size={12} className={analyzing ? 'animate-spin' : ''} />
          {analyzing ? t('Analyzing…', 'Analyse…') : t('Re-run', 'Relancer')}
        </button>
        <button onClick={() => setSection('checks')} className="flex h-8 flex-1 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong">
          {t('Full page', 'En grand')}
        </button>
      </div>
    </div>
  );
}

function PageBody() {
  const setSection = useStore((s) => s.setSection);
  return (
    <div className="flex flex-col gap-5">
      <PageTab />
      <ShareTab />
      <button onClick={() => setSection('partage')} className="self-start text-xs text-muted hover:text-fg">
        {t('See every Open Graph preview →', 'Voir tous les aperçus Open Graph →')}
      </button>
    </div>
  );
}

/** Page or Checks, next to the devices: opened and closed from the left bar. */
export function SidePanel() {
  const { panel, togglePanel, share, shareError, status, error, url, report, analyzing, analyze } = useStore();
  if (!panel) return null;
  if (panel === 'feedback') return <FeedbackPanel />;
  if (panel === 'emulation') return <EmulationPanel />;
  let body;
  if (!url) body = <p className="text-faint">{t('Enter your dev server’s address at the top, or just its port (e.g. 3000).', 'Saisis l’adresse de ton serveur de dev en haut, ou juste son port (ex. 3000).')}</p>;
  else if (status === 'failed') body = <p className="text-faint">{error}</p>;
  else if (shareError) body = <p className="text-faint">{t('Couldn’t read the tags:', 'Lecture des balises impossible :')} {shareError}</p>;
  else if (!share || !report)
    body = analyzing || status !== 'loaded' ? (
      <p className="text-faint">{t('Reading the page…', 'Lecture de la page…')}</p>
    ) : (
      <button onClick={() => void analyze(url)} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
        {t('Analyze this page', 'Analyser cette page')}
      </button>
    );
  else body = panel === 'page' ? <PageBody /> : <ChecksBody />;

  return (
    <aside aria-label={panel === 'page' ? 'Page' : 'Checks'} className="flex w-[340px] shrink-0 flex-col border-r border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft pr-2 pl-4">
        <span className="label">{panel === 'page' ? 'Page' : 'Checks'}</span>
        <span className="flex items-center gap-2">
          {panel === 'checks' && report && (
            <span className="font-mono text-xs">
              {report.score.passed}
              <span className="text-faint">/{report.score.total}</span>
            </span>
          )}
          <button onClick={() => togglePanel(panel)} aria-label={t('Close', 'Fermer')} title={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  );
}
