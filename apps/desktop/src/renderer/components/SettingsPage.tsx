import { useStore } from '../store';
import { Icon } from './Icons';
import { ActivityList, CopyButton, SLASH } from './Mcp';
import { VercelSettings } from './VercelSettings';

const TOOLS: [string, string][] = [
  ['status', 'Page ouverte et appareils émulés'],
  ['open_url', 'Ouvre une URL sur tous les appareils'],
  ['set_devices', 'Change les appareils émulés'],
  ['screenshot', 'Capture chaque appareil (Claude voit le rendu)'],
  ['get_page_meta', 'Balises lues comme un robot de partage'],
  ['get_share_preview', 'Aperçus sur 7 plateformes + correctif'],
  ['run_checks', 'Les 24 checks, mesures dans les appareils incluses'],
  ['list_pages', 'Pages du site'],
  ['list_deployments', 'Déploiements Vercel du projet lié'],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const mcp = useStore((s) => s.mcp);
  const platform = useStore((s) => s.platform);
  const last = mcp?.activity[0];

  return (
    <main className="flex min-w-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-[880px] flex-col gap-8">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">Réglages</h1>
          <p className="m-0 mt-1 text-muted">Parakeet {platform?.version} · réglages enregistrés dans ~/.config/Parakeet</p>
        </div>

        <Section title="Serveur MCP pour Claude Code">
          <div className="overflow-hidden rounded-[10px] border border-line bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-active shadow-[inset_0_0_0_1px_#2a2a2f]">
                <Icon name="terminal" size={15} />
              </span>
              <div className="flex flex-1 flex-col">
                <span className="font-medium">Claude lit tes aperçus, tes balises et tes checks, et vérifie lui-même ses corrections.</span>
                <span className="text-xs text-muted">
                  {last ? `Dernier appel : ${last.tool}, ${new Date(last.at).toLocaleTimeString('fr-FR')}` : 'Aucun appel depuis le lancement de Parakeet.'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-line-soft p-3.5">
              <span className="label">1. Installer (une fois)</span>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 rounded-ui border border-line bg-bg px-3 py-2 font-mono text-xs break-all text-fg">{mcp?.command ?? '…'}</code>
                {mcp && <CopyButton text={mcp.command} label="Copier" />}
              </div>
              <span className="text-xs text-muted">
                À lancer dans un terminal. <span className="font-mono">--scope user</span> rend Parakeet disponible dans tous tes projets. Le serveur marche aussi app fermée, sauf pour les captures et les mesures dans les appareils.
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-line-soft p-3.5">
              <span className="label">2. Utiliser</span>
              <span className="text-xs text-muted">Demande simplement à Claude « vérifie la home sur iPhone avec Parakeet », ou lance une de ces commandes dans Claude Code :</span>
              <div className="flex flex-col gap-1.5">
                {[
                  [SLASH.share, 'corrige les aperçus de partage de la page ouverte, puis vérifie'],
                  [SLASH.checks, 'corrige les problèmes trouvés par les checks, puis relance-les'],
                ].map(([cmd, what]) => (
                  <div key={cmd} className="flex items-center gap-3">
                    <code className="font-mono text-xs text-fg">{cmd}</code>
                    <span className="flex-1 text-xs text-muted">{what}</span>
                    <CopyButton text={cmd!} label="Copier" />
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line-soft">
              <div className="label px-3.5 pt-3 pb-1">Outils exposés à Claude</div>
              {TOOLS.map(([name, what]) => (
                <div key={name} className="flex gap-3 px-3.5 py-1.5">
                  <span className="w-40 shrink-0 font-mono text-xs">{name}</span>
                  <span className="text-xs text-muted">{what}</span>
                </div>
              ))}
              <div className="h-2" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label">Activité récente</span>
            <ActivityList items={mcp?.activity ?? []} limit={20} />
          </div>
        </Section>

        <Section title="Vercel">
          <VercelSettings />
        </Section>
      </div>
    </main>
  );
}
