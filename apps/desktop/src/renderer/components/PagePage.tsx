import { t } from '@kinglet/core';
import { useStore } from '../store';
import { Icon } from './Icons';
import { LinkCard } from './Inspector';
import { HreflangCard, StructuredDataCard } from './PageExtras';
import { askAllButton, EmptyReport, PassedBlock, PassedGrid, ProblemList, reRunButton, ReportHeader, SummaryBand, type Problem, type Tone } from './ReportUI';

const lengthTone = (n: number, max: number): Tone => (n === 0 ? 'error' : n > max ? 'warning' : 'ok');

/**
 * The page's tags as a bot reads them (title, description, share tags, language, canonical,
 * structured data, hreflang), in the same look as Checks and Security.
 */
export function PagePage() {
  const s = useStore();
  const { share, report, url, analyzing, analyze, status, shareError, error } = s;
  if (!url) return <EmptyReport text={t('Open a site to read its tags.', 'Ouvre un site pour lire ses balises.')} />;
  if (status === 'failed') return <EmptyReport text={error ?? ''} />;
  if (shareError) return <EmptyReport text={`${t('Couldn’t read the tags:', 'Lecture des balises impossible :')} ${shareError}`} />;
  if (!share || !report)
    return (
      <EmptyReport
        text={analyzing || status !== 'loaded' ? t('Reading the page…', 'Lecture de la page…') : t('The page hasn’t been read yet.', 'La page n’a pas encore été lue.')}
        action={
          !analyzing && status === 'loaded' ? (
            <button onClick={() => void analyze(url)} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
              {t('Read this page', 'Lire cette page')}
            </button>
          ) : undefined
        }
      />
    );

  const { meta, image, issues } = share;
  const title = meta.title ?? '';
  const desc = meta.description ?? '';
  const errors = issues.filter((i) => i.severity === 'error').length;
  const structured = report.structured?.items.length ?? 0;
  const problems: Problem[] = issues.map((i) => ({ id: i.id, tone: i.severity, label: i.tag, family: t('Share', 'Partage'), detail: i.message, mono: true }));
  const tags = [
    ['og:title', meta.og['title'] ?? null],
    ['og:description', meta.og['description'] ?? null],
    ['og:site_name', meta.og['site_name'] ?? null],
    ['og:image', meta.ogImageUrl],
    ['twitter:card', meta.twitter['card'] ?? null],
  ] as const;
  const page = [
    ['lang', meta.lang],
    ['viewport', meta.viewport],
    ['canonical', meta.canonical],
    ['robots', meta.robotsMeta ?? meta.robotsHeader],
    ['theme-color', meta.themeColor],
    [t('icons', 'icônes'), meta.icons.length ? meta.icons.map((u) => u.split('/').pop()).join(', ') : null],
  ] as const;
  const asItems = (list: readonly (readonly [string, string | null])[]) => list.filter(([, v]) => v).map(([k, v]) => ({ id: k, label: k, value: v!, tone: 'ok' as const, mono: true }));
  const missing = [...tags, ...page].filter(([, v]) => !v).map(([k]) => k);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 [&>*]:shrink-0">
      <ReportHeader
        icon="doc"
        title="Page"
        url={meta.finalUrl}
        subtitle={`${t('read as', 'lue comme')} ${meta.fetchedAs} · HTTP ${meta.status} · ${meta.durationMs} ms`}
        actions={
          <>
            {issues.length > 0 && s.settings.claudePanel && (
              <button
                onClick={() =>
                  s.askClaude([t(`Fix the share tags of ${meta.finalUrl}:`, `Corrige les balises de partage de ${meta.finalUrl} :`), ...issues.map((i) => `- [${i.severity}] ${i.tag}: ${i.message}`)].join('\n'))
                }
                className={askAllButton}
              >
                {t(`Ask Claude to fix all ${issues.length}`, `Tout faire corriger par Claude (${issues.length})`)}
              </button>
            )}
            <button onClick={() => s.setSection('partage')} className={reRunButton}>
              {t('Open Graph previews', 'Aperçus Open Graph')}
            </button>
            <button onClick={() => void analyze(url, { refreshSite: true })} disabled={analyzing} className={reRunButton}>
              <Icon name="reload" size={13} className={analyzing ? 'animate-spin' : ''} />
              {analyzing ? t('Reading…', 'Lecture…') : t('Re-run', 'Relancer')}
            </button>
          </>
        }
      />

      <SummaryBand
        cells={[
          { label: t('Title', 'Titre'), tone: lengthTone(title.length, 60), value: <span className="font-mono">{title.length} / 60</span> },
          { label: 'Description', tone: lengthTone(desc.length, 160), value: <span className="font-mono">{desc.length} / 160</span> },
          { label: t('Share tags', 'Balises de partage'), tone: errors ? 'error' : issues.length ? 'warning' : 'ok', value: issues.length ? t(`${issues.length} to fix`, `${issues.length} à corriger`) : t('All set', 'Complètes') },
          { label: t('Image', 'Image'), tone: !meta.ogImageUrl ? 'error' : image?.ok ? 'ok' : 'warning', value: image?.ok ? `${image.width}×${image.height}` : meta.ogImageUrl ? t('Unreachable', 'Inaccessible') : t('Missing', 'Absente') },
          { label: t('Language', 'Langue'), tone: meta.lang ? 'ok' : 'warning', value: meta.lang ?? t('Missing', 'Absente') },
          { label: t('Structured data', 'Données structurées'), tone: structured ? 'ok' : 'skip', value: structured ? t(`${structured} item${structured > 1 ? 's' : ''}`, `${structured} élément${structured > 1 ? 's' : ''}`) : t('None', 'Aucune') },
        ]}
      />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
        <section aria-label={t('In search results', 'Dans les résultats de recherche')} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <span className="label">{t('Title and description', 'Titre et description')}</span>
          <span className="text-[17px] leading-snug font-semibold tracking-[-0.01em]">{title || t('— missing —', '— absent —')}</span>
          <span className="leading-relaxed text-muted">{desc || t('— missing —', '— absente —')}</span>
        </section>
        <section aria-label={t('Link preview', 'Aperçu du lien')} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <span className="label">{t('Link preview · WhatsApp', 'Aperçu du lien · WhatsApp')}</span>
          <LinkCard />
        </section>
      </div>

      <ProblemList title={t('To fix', 'À corriger')} problems={problems} onAsk={s.settings.claudePanel ? (p) => s.askClaude(t(`Fix this tag on ${meta.finalUrl}: ${p.label}. ${p.detail}`, `Corrige cette balise sur ${meta.finalUrl} : ${p.label}. ${p.detail}`)) : undefined} />

      <PassedGrid title={t('Tags', 'Balises')}>
        <PassedBlock title={t('Share', 'Partage')} items={asItems(tags)} />
        <PassedBlock title={t('Page', 'Page')} items={asItems(page)} />
      </PassedGrid>
      {missing.length > 0 && <p className="m-0 text-xs text-ghost">{t(`Missing: ${missing.join(', ')}.`, `Absentes : ${missing.join(', ')}.`)}</p>}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
        <StructuredDataCard />
        <HreflangCard />
      </div>
    </main>
  );
}
