import { activePresets, useStore, type Section } from '../store';
import { CheckGroups } from './Checks';
import { Dot, Icon } from './Icons';
import { IssueList, LinkCard } from './Inspector';

export function SharePage() {
  const share = useStore((s) => s.share);
  const url = useStore((s) => s.url);
  if (!share) return <Empty text={url ? 'Lecture des balises…' : 'Ouvre un site pour voir ses balises de partage.'} />;
  const { meta, issues } = share;
  const ogRows = Object.entries(meta.og).map(([k, v]) => [`og:${k}`, v] as const);
  const twRows = Object.entries(meta.twitter).map(([k, v]) => [`twitter:${k}`, v] as const);
  const missing = issues.filter((i) => i.id.endsWith('-missing') && i.tag.includes(':')).map((i) => [i.tag, null, i.severity] as const);
  const rows: (readonly [string, string | null, string?])[] = [...ogRows, ...twRows, ...missing];

  return (
    <main className="flex min-w-0 flex-1 gap-6 overflow-y-auto p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">Aperçus de partage</h1>
          <p className="m-0 mt-1 text-muted">Ce que voient les robots de WhatsApp, Slack ou LinkedIn : le HTML brut, sans JavaScript.</p>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line bg-card">
          <ul>
            <IssueList issues={issues} />
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">WhatsApp</span>
          <div className="max-w-md">
            <LinkCard />
          </div>
          <p className="m-0 text-xs text-faint">Les rendus LinkedIn, X, Slack, Discord, iMessage et Google arrivent en phase 3.</p>
        </div>
      </div>
      <div className="flex w-[420px] shrink-0 flex-col gap-3">
        <span className="label">Balises lues</span>
        <div className="overflow-hidden rounded-[10px] border border-line bg-card">
          {rows.map(([k, v, severity]) => (
            <div key={k} className="flex items-center gap-3 border-t border-line-soft px-3 py-2 first:border-t-0">
              <Dot className={v ? 'bg-ok' : severity === 'error' ? 'bg-err' : 'bg-warn'} />
              <span className="w-32 shrink-0 font-mono text-[11.5px] text-faint">{k}</span>
              <span className={`min-w-0 truncate text-xs ${v ? 'text-fg' : severity === 'error' ? 'text-err' : 'text-warn'}`}>{v ?? 'absent'}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

const SOON: Record<Exclude<Section, 'apercu' | 'partage' | 'checks'>, { title: string; text: string; phase: string }> = {
  comparer: { title: 'Comparer', text: 'Local, preview et prod côte à côte, avec les différences de balises surlignées.', phase: 'Phase 5 · Vercel' },
  deploiements: { title: 'Déploiements', text: 'Les déploiements Vercel de ton projet, chaque branche ouvrable sur n’importe quel appareil.', phase: 'Phase 5 · Vercel' },
  reglages: { title: 'Réglages', text: 'Serveur MCP pour Claude Code, connexion Vercel, environnements et appareils par défaut.', phase: 'Phases 4 et 5' },
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
