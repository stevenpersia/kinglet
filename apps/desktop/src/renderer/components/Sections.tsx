import { activePresets, useStore, type Section } from '../store';
import { CheckGroups } from './Checks';
import { Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

const SOON: Record<Exclude<Section, 'apercu' | 'partage' | 'checks' | 'reglages'>, { title: string; text: string; phase: string }> = {
  comparer: { title: 'Comparer', text: 'Local, preview et prod côte à côte, avec les différences de balises surlignées.', phase: 'Phase 5 · Vercel' },
  deploiements: { title: 'Déploiements', text: 'Les déploiements Vercel de ton projet, chaque branche ouvrable sur n’importe quel appareil.', phase: 'Phase 5 · Vercel' },
};

function Empty({ text }: { text: string }) {
  return (
    <main className="stage-bg flex flex-1 items-center justify-center">
      <p className="text-faint">{text}</p>
    </main>
  );
}

export function SoonPage({ section }: { section: keyof typeof SOON }) {
  const s = SOON[section];
  return (
    <main className="stage-bg flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-faint">{s.phase}</span>
        <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{s.title}</h1>
        <p className="m-0 leading-relaxed text-muted">{s.text}</p>
      </div>
    </main>
  );
}

export function ChecksPage() {
  const state = useStore();
  const { report, url, analyzing, analyze } = state;
  if (!report) return <Empty text={url ? 'Analyse en cours…' : 'Ouvre un site pour lancer les checks.'} />;
  const devices = activePresets(state);
  const errors = report.checks.filter((c) => c.status === 'error').length;
  const warnings = report.checks.filter((c) => c.status === 'warning').length;
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">Checks</h1>
          <p className="m-0 mt-1 text-muted">
            <span className="font-mono text-xs">{new URL(report.url).pathname}</span> · HTML lu comme Google, page rendue mesurée sur {devices.map((d) => d.label).join(', ')}.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono text-2xl font-medium tracking-[-0.02em]">
              {report.score.passed}
              <span className="text-faint">/{report.score.total}</span>
            </div>
            <div className="text-xs text-muted">
              {errors} problème{errors > 1 ? 's' : ''} · {warnings} à améliorer
            </div>
          </div>
          {errors + warnings > 0 && <CopyButton text={SLASH.checks} label="Faire corriger par Claude" done="Commande copiée : colle-la dans Claude Code ✓" />}
          <button
            onClick={() => void analyze(report.url, { refreshSite: true })}
            disabled={analyzing}
            className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60"
          >
            <Icon name="reload" size={13} className={analyzing ? 'animate-spin' : ''} />
            {analyzing ? 'Analyse…' : 'Relancer'}
          </button>
        </div>
      </div>
      <CheckGroups checks={report.checks} />
    </main>
  );
}
