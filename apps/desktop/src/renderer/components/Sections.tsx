import { CHECK_GROUPS, t, type CheckGroup, type CheckResult } from '@kinglet/core';
import { activePresets, useStore } from '../store';
import { askCheck } from './askCheck';
import { Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';
import { SiteAuditView } from './SiteAudit';
import { openOgImageEditor } from './OgImageEditor';
import { A11yDetails, BudgetsCard } from './PageExtras';
import { AllClear, askAllButton, EmptyReport, NotChecked, PassedBlock, PassedGrid, ProblemList, reRunButton, ReportHeader, ScoreValue, SummaryBand, TONE_RANK, type Problem, type Tone } from './ReportUI';

/** Checks of the page shown, or of the whole site. */
export function ChecksPage() {
  const scope = useStore((s) => s.checksScope);
  const setScope = (checksScope: 'page' | 'site') => useStore.setState({ checksScope });
  const tabs = (
    <div role="tablist" className="flex shrink-0 gap-1 px-6 pt-5">
      {(
        [
          ['page', t('This page', 'Cette page')],
          ['site', t('Whole site', 'Tout le site')],
        ] as const
      ).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={scope === id} onClick={() => setScope(id)} className={`h-8 rounded-md px-3 text-[13px] ${scope === id ? 'bg-active font-medium text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:text-fg'}`}>
          {label}
        </button>
      ))}
    </div>
  );
  if (scope === 'site')
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {tabs}
        <div className="flex flex-col gap-4 p-6 pt-4">
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Site audit', 'Audit du site')}</h1>
          <SiteAuditView />
        </div>
      </main>
    );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {tabs}
      <PageChecks />
    </div>
  );
}

const isProblem = (c: CheckResult) => c.status === 'error' || c.status === 'warning';

/** One family's cell in the summary band: its worst status and how many are left to fix. */
function familyCell(checks: CheckResult[], g: CheckGroup, label: string) {
  const items = checks.filter((c) => c.group === g);
  const tone: Tone = (items.map((c) => c.status as Tone).sort((a, b) => TONE_RANK[a] - TONE_RANK[b])[0] ?? 'skip') as Tone;
  const toFix = items.filter(isProblem).length;
  const measured = items.filter((c) => c.status !== 'skip');
  const value = !measured.length ? t('Not measured', 'Non mesuré') : toFix ? t(`${toFix} to fix`, `${toFix} à corriger`) : t('All good', 'Tout va bien');
  return { label, tone: tone === 'info' ? ('ok' as Tone) : tone, value };
}

function PageChecks() {
  const state = useStore();
  const { report, url, analyzing, analyze, status } = state;
  if (!report && url && !analyzing && status === 'loaded')
    return (
      <EmptyReport
        text={t('The checks haven’t run on this page yet.', 'Les checks n’ont pas encore tourné sur cette page.')}
        action={
          <button onClick={() => void analyze(url)} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
            {t('Run the checks', 'Lancer les checks')}
          </button>
        }
      />
    );
  if (!report) return <EmptyReport text={url ? t('Analyzing…', 'Analyse en cours…') : t('Open a site to run the checks.', 'Ouvre un site pour lancer les checks.')} />;

  const devices = activePresets(state);
  const checks = report.checks;
  const problems = checks.filter(isProblem).sort((a, b) => TONE_RANK[a.status as Tone] - TONE_RANK[b.status as Tone]);
  const errors = problems.filter((c) => c.status === 'error').length;
  const groupLabel = (g: CheckGroup) => CHECK_GROUPS.find((x) => x.id === g)?.label ?? g;
  const ask = askCheck();
  const asProblem = (c: CheckResult): Problem => ({
    id: c.id,
    tone: c.status as 'error' | 'warning',
    label: c.label,
    family: groupLabel(c.group),
    detail: c.detail,
    // A share image made from the page fixes these two.
    evidence:
      c.id === 'og-image' || c.id === 'og-image-format' ? (
        <button onClick={openOgImageEditor} className="flex h-8 w-fit items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
          <Icon name="page" size={13} />
          {t('Make the share image…', 'Générer l’image de partage…')}
        </button>
      ) : undefined,
  });
  const askAll = () =>
    state.askClaude(
      [
        t(`Fix these problems found by Kinglet’s checks on ${report.url}:`, `Corrige ces problèmes trouvés par les checks de Kinglet sur ${report.url} :`),
        ...problems.map((c) => `- [${c.status}] ${groupLabel(c.group)} · ${c.label}: ${c.detail}`),
        '',
        t('Fix them in the project’s code without changing the design or the visible content, then run the checks again.', 'Corrige-les dans le code du projet sans changer le design ni le contenu visible, puis relance les checks.'),
      ].join('\n'),
    );
  const scoreTone: Tone = errors ? 'error' : problems.length ? 'warning' : 'ok';
  const passedOf = (g: CheckGroup) => checks.filter((c) => c.group === g && (c.status === 'ok' || c.status === 'info')).map((c) => ({ id: c.id, label: c.label, value: c.detail, tone: c.status as 'ok' | 'info' }));
  const skipped = checks.filter((c) => c.status === 'skip');

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 [&>*]:shrink-0 pt-4">
      <ReportHeader
        icon="checkCircle"
        title="Checks"
        url={report.url}
        subtitle={t(`HTML read as Google, rendered page measured on ${devices.map((d) => d.label).join(', ')}`, `HTML lu comme Google, page rendue mesurée sur ${devices.map((d) => d.label).join(', ')}`)}
        actions={
          <>
            {problems.length > 0 && state.settings.claudePanel && (
              <button onClick={askAll} className={askAllButton}>
                {t(`Ask Claude to fix all ${problems.length}`, `Tout faire corriger par Claude (${problems.length})`)}
              </button>
            )}
            {problems.length > 0 && <CopyButton text={SLASH.checks} label={t('Copy the command', 'Copier la commande')} done={t('Command copied: paste it into Claude Code ✓', 'Commande copiée : colle-la dans Claude Code ✓')} />}
            <button onClick={() => void analyze(report.url, { refreshSite: true })} disabled={analyzing} className={reRunButton}>
              <Icon name="reload" size={13} className={analyzing ? 'animate-spin' : ''} />
              {analyzing ? t('Analyzing…', 'Analyse…') : t('Re-run', 'Relancer')}
            </button>
          </>
        }
      />

      {problems.length ? (
        <SummaryBand
          cells={[
            {
              label: t('Score', 'Score'),
              tone: scoreTone,
              value: (
                <>
                  <ScoreValue passed={report.score.passed} total={report.score.total} tone={scoreTone} />
                  <span className={`ml-2 font-medium ${errors ? 'text-err' : 'text-warn'}`}>{errors ? t(`${errors} problem${errors > 1 ? 's' : ''}`, `${errors} problème${errors > 1 ? 's' : ''}`) : t(`${problems.length} to improve`, `${problems.length} à améliorer`)}</span>
                </>
              ),
            },
            ...CHECK_GROUPS.map((g) => familyCell(checks, g.id, g.label)),
          ]}
        />
      ) : (
        <AllClear
          title={t('Nothing to fix', 'Rien à corriger')}
          text={t('Every check that can be measured here passes: SEO, sharing, content, mobile, accessibility, privacy and technical.', 'Chaque check mesurable ici passe : SEO, partage, contenu, mobile, accessibilité, vie privée et technique.')}
          score={<ScoreValue passed={report.score.passed} total={report.score.total} tone="ok" />}
        />
      )}

      <ProblemList title={t('To fix', 'À corriger')} problems={problems.map(asProblem)} onAsk={ask ? (p) => ask(checks.find((c) => c.id === p.id)!) : undefined} />

      <PassedGrid title={problems.length ? t(`Passed · ${checks.filter((c) => c.status === 'ok' || c.status === 'info').length}`, `Réussi · ${checks.filter((c) => c.status === 'ok' || c.status === 'info').length}`) : undefined}>
        {CHECK_GROUPS.map((g) => (
          <PassedBlock key={g.id} title={g.label} items={passedOf(g.id)} />
        ))}
      </PassedGrid>

      <NotChecked labels={skipped.map((c) => c.label)} />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
        <A11yDetails />
        <BudgetsCard />
      </div>
    </main>
  );
}
