import { locale, t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import { PRIVACY_URL, TERMS_URL } from '../../shared/legal';
import type { LicenseState } from '../../shared/types';
import { activePresets, api, useStore, type SettingsTab } from '../store';
import { Icon, type IconName } from './Icons';
import { DeviceSettings, GeneralSettings } from './GeneralSettings';
import { ActivityList, CopyButton, SLASH } from './Mcp';
import { ProjectSettings, VercelSettings } from './VercelSettings';
import { ClaudePanelSettings, ClaudeSettings } from './ClaudeSettings';
import { GitHubSettings } from './GitHubSettings';
import { activeProject } from '../../shared/projects';

const tools = (): [string, string][] => [
  ['status', t('Open page and emulated devices', 'Page ouverte et appareils émulés')],
  ['open_url', t('Opens a URL on every device', 'Ouvre une URL sur tous les appareils')],
  ['set_devices', t('Changes the emulated devices', 'Change les appareils émulés')],
  ['screenshot', t('Captures each device (Claude sees the render)', 'Capture chaque appareil (Claude voit le rendu)')],
  ['get_page_meta', t('Tags as read by a share crawler', 'Balises lues comme un robot de partage')],
  ['get_share_preview', t('Previews on 10 platforms + fix', 'Aperçus sur 10 plateformes + correctif')],
  ['run_checks', t('All 53 checks, including on-device measurements', 'Les 53 checks, mesures dans les appareils incluses')],
  ['run_security', t('Leaked keys, exposed files, headers, cookies', 'Clés exposées, fichiers accessibles, en-têtes, cookies')],
  ['audit_site', t('Every page: broken links, duplicates, sitemap, hreflang', 'Toutes les pages : liens cassés, doublons, sitemap, hreflang')],
  ['get_accessibility', t('axe-core audit and keyboard focus in the devices', 'Audit axe-core et focus clavier dans les appareils')],
  ['get_structured_data', t('JSON-LD and rich results', 'JSON-LD et résultats enrichis')],
  ['list_pages', t('Site pages', 'Pages du site')],
  ['list_deployments', t('Vercel deployments of the linked project', 'Déploiements Vercel du projet lié')],
];

function UpdateSettings() {
  const update = useStore((s) => s.update);
  const [checking, setChecking] = useState(false);
  if (!update) return null;
  const KIND = { appimage: 'AppImage', pacman: t('pacman package', 'paquet pacman'), other: t('package', 'paquet'), unknown: t('development build', 'version de développement') } as const;
  const text: Record<typeof update.status, string> = {
    unsupported:
      update.kind === 'unknown'
        ? t('Automatic updates apply to the installed app (AppImage or pacman package), not the development build.', 'Les mises à jour automatiques concernent l’app installée (AppImage ou paquet pacman), pas la version de développement.')
        : t('Automatic updates aren’t available for this type of install.', 'Mises à jour automatiques non disponibles pour ce type d’installation.'),
    idle: t('Checks at startup, then every 6 hours.', 'Vérification au démarrage, puis toutes les 6 heures.'),
    checking: t('Checking…', 'Vérification…'),
    none: t('Kinglet is up to date.', 'Kinglet est à jour.'),
    available: t(`Version ${update.latest} available, downloading…`, `Version ${update.latest} disponible, téléchargement…`),
    downloading: t(`Downloading version ${update.latest}: ${update.percent ?? 0}%`, `Téléchargement de la version ${update.latest} : ${update.percent ?? 0} %`),
    ready: t(
      `Version ${update.latest} is ready.${update.kind === 'pacman' ? ' Installing will ask for your administrator password.' : ''}`,
      `Version ${update.latest} prête.${update.kind === 'pacman' ? ' L’installation demandera ton mot de passe administrateur.' : ''}`,
    ),
    error: update.error ?? t('Error', 'Erreur'),
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-card p-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">
          Kinglet {update.current} <span className="font-normal text-muted">· {KIND[update.kind]}</span>
        </span>
        <span className={`text-xs ${update.status === 'error' ? 'text-err' : 'text-muted'}`}>{text[update.status]}</span>
      </div>
      {update.status === 'ready' ? (
        <button onClick={() => api().update.install()} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
          {t('Install and restart', 'Installer et redémarrer')}
        </button>
      ) : (
        update.status !== 'unsupported' && (
          <button
            disabled={checking || update.status === 'checking' || update.status === 'downloading'}
            onClick={async () => {
              setChecking(true);
              useStore.setState({ update: await api().update.check() });
              setChecking(false);
            }}
            className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60"
          >
            {t('Check now', 'Vérifier maintenant')}
          </button>
        )
      )}
    </div>
  );
}

function LicenseSettings() {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void api().license.state().then(setLicense), []);
  if (!license) return null;
  if (license.status === 'dev')
    return <p className="m-0 text-muted">{t('Development build: no license is asked. The installed app (AppImage or pacman package) asks for one.', 'Version de développement : aucune licence demandée. L’app installée (AppImage ou paquet pacman) en demande une.')}</p>;
  const rows: [string, string | null][] = [
    [t('Licensed to', 'Licence de'), [license.customer, license.email].filter(Boolean).join(' · ') || null],
    [t('Key', 'Clé'), license.key],
    [t('This computer', 'Cet ordinateur'), license.instanceName],
    [t('Computers', 'Ordinateurs'), license.activationLimit ? t(`Up to ${license.activationLimit}`, `Jusqu’à ${license.activationLimit}`) : null],
    [
      t('Last check', 'Dernière vérification'),
      license.validatedAt
        ? `${new Date(license.validatedAt).toLocaleString(locale())}${license.status === 'offline' ? t(' (offline since)', ' (hors ligne depuis)') : ''}`
        : null,
    ],
  ];
  return (
    <>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-line-soft px-3.5 py-2.5 last:border-b-0">
              <span className="w-40 shrink-0 text-muted">{k}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs leading-5">{v}</span>
            </div>
          ))}
      </div>
      <p className="m-0 text-xs text-muted">
        {t(
          'Kinglet checks the license with Polar at startup and every 6 hours. Offline, it keeps working for 14 days after the last check. Your activations are also listed in Polar’s customer portal.',
          'Kinglet vérifie la licence auprès de Polar au démarrage et toutes les 6 heures. Hors ligne, il continue de marcher 14 jours après la dernière vérification. Tes activations sont aussi listées dans l’espace client Polar.',
        )}{' '}
        <button onClick={() => api().openExternal(TERMS_URL)} className="text-fg underline-offset-2 hover:underline">
          {t('License terms', 'Conditions de licence')}
        </button>
        {' · '}
        <button onClick={() => api().openExternal(PRIVACY_URL)} className="text-fg underline-offset-2 hover:underline">
          {t('Privacy', 'Confidentialité')}
        </button>
      </p>
      <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-3.5">
        <span className="font-medium">{t('Move Kinglet to another computer', 'Passer Kinglet sur un autre ordinateur')}</span>
        <span className="text-xs text-muted">
          {t(
            'Frees this computer’s activation so the key can be used elsewhere. Kinglet then restarts on the license screen.',
            'Libère l’activation de cet ordinateur pour utiliser la clé ailleurs. Kinglet redémarre ensuite sur l’écran de licence.',
          )}
        </span>
        {error && <span className="text-xs text-err">{error}</span>}
        <div className="flex gap-2 pt-1">
          {confirming ? (
            <>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await api().license.deactivate();
                  setBusy(false);
                  if (!r.ok) setError(r.error), setConfirming(false);
                }}
                className="h-8 rounded-ui bg-err px-3 font-semibold text-bg disabled:opacity-60"
              >
                {busy ? t('Deactivating…', 'Désactivation…') : t('Deactivate and restart', 'Désactiver et redémarrer')}
              </button>
              <button onClick={() => setConfirming(false)} className="h-8 rounded-ui px-3 text-muted hover:text-fg">
                {t('Cancel', 'Annuler')}
              </button>
            </>
          ) : (
            <button onClick={() => (setConfirming(true), setError(null))} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong">
              {t('Deactivate on this computer', 'Désactiver sur cet ordinateur')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function McpSettings() {
  const mcp = useStore((s) => s.mcp);
  const last = mcp?.activity[0];
  return (
    <>
          <div className="overflow-hidden rounded-[10px] border border-line bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-active shadow-[inset_0_0_0_1px_#2a2a2f]">
                <Icon name="terminal" size={15} />
              </span>
              <div className="flex flex-1 flex-col">
                <span className="font-medium">
                  {t('Claude reads your previews, tags and checks, and verifies its own fixes.', 'Claude lit tes aperçus, tes balises et tes checks, et vérifie lui-même ses corrections.')}
                </span>
                <span className="text-xs text-muted">
                  {last
                    ? t(`Last call: ${last.tool}, ${new Date(last.at).toLocaleTimeString(locale())}`, `Dernier appel : ${last.tool}, ${new Date(last.at).toLocaleTimeString(locale())}`)
                    : t('No calls since Kinglet started.', 'Aucun appel depuis le lancement de Kinglet.')}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-line-soft p-3.5">
              <span className="label">{t('1. Install (once)', '1. Installer (une fois)')}</span>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 rounded-ui border border-line bg-bg px-3 py-2 font-mono text-xs break-all text-fg">{mcp?.command ?? '…'}</code>
                {mcp && <CopyButton text={mcp.command} label={t('Copy', 'Copier')} />}
              </div>
              <span className="text-xs text-muted">
                {t('Run it in a terminal.', 'À lancer dans un terminal.')} <span className="font-mono">--scope user</span>{' '}
                {t(
                  'makes Kinglet available in all your projects. The server also works with the app closed, except for screenshots and on-device measurements.',
                  'rend Kinglet disponible dans tous tes projets. Le serveur marche aussi app fermée, sauf pour les captures et les mesures dans les appareils.',
                )}
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-line-soft p-3.5">
              <span className="label">{t('2. Use', '2. Utiliser')}</span>
              <span className="text-xs text-muted">
                {t('Open a terminal in your project folder, run', 'Ouvre un terminal dans le dossier du projet, lance')} <code className="font-mono text-fg">claude</code>{' '}
                {t(
                  'and ask “check the home page on iPhone with Kinglet”, or run one of these commands:',
                  'et demande « vérifie la home sur iPhone avec Kinglet », ou lance une de ces commandes :',
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                {[
                  [SLASH.share, t('fixes the open page’s share previews, then verifies', 'corrige les aperçus de partage de la page ouverte, puis vérifie')],
                  [SLASH.checks, t('fixes the problems found by the checks, then re-runs them', 'corrige les problèmes trouvés par les checks, puis relance-les')],
                ].map(([cmd, what]) => (
                  <div key={cmd} className="flex items-center gap-3">
                    <code className="font-mono text-xs text-fg">{cmd}</code>
                    <span className="flex-1 text-xs text-muted">{what}</span>
                    <CopyButton text={cmd!} label={t('Copy', 'Copier')} />
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line-soft">
              <div className="label px-3.5 pt-3 pb-1">{t('Tools exposed to Claude', 'Outils exposés à Claude')}</div>
              {tools().map(([name, what]) => (
                <div key={name} className="flex gap-3 px-3.5 py-1.5">
                  <span className="w-40 shrink-0 font-mono text-xs">{name}</span>
                  <span className="text-xs text-muted">{what}</span>
                </div>
              ))}
              <div className="h-2" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label">{t('Recent activity', 'Activité récente')}</span>
            <ActivityList items={mcp?.activity ?? []} limit={20} />
          </div>
    </>
  );
}

const NAV = (): { group: string; items: { id: SettingsTab; label: string; icon: IconName }[] }[] => {
  const project = activeProject(useStore.getState().settings);
  return [
    {
      group: 'App',
      items: [
        { id: 'general', label: t('General', 'Général'), icon: 'globe' },
        { id: 'devices', label: t('Devices', 'Appareils'), icon: 'phone' },
        { id: 'license', label: t('License', 'Licence'), icon: 'checkCircle' },
      ],
    },
    { group: project ? `${t('Project', 'Projet')} · ${project.name}` : t('Project', 'Projet'), items: [{ id: 'project', label: t('Active project', 'Projet actif'), icon: 'folder' }] },
    {
      group: t('Integrations', 'Intégrations'),
      items: [
        { id: 'vercel', label: 'Vercel', icon: 'tri' },
        { id: 'github', label: 'GitHub', icon: 'git' },
        { id: 'claude', label: t('Claude in Kinglet', 'Claude dans Kinglet'), icon: 'spark' },
        { id: 'mcp', label: t('Claude in terminal', 'Claude dans le terminal'), icon: 'terminal' },
        { id: 'updates', label: t('Updates', 'Mises à jour'), icon: 'download' },
      ],
    },
  ];
};

export function SettingsPage() {
  const s = useStore();
  const { settingsTab, platform } = s;
  const nav = NAV();
  const current = nav.flatMap((g) => g.items).find((i) => i.id === settingsTab)!;
  const sub: Partial<Record<SettingsTab, string>> = {
    general: t('Applies to every project.', 'Vaut pour tous les projets.'),
    claude: t('Your claude in a terminal next to your devices, in the project folder. To use it from another terminal or your editor instead, see “Claude in terminal”.', 'Ton claude dans un terminal à côté de tes appareils, dans le dossier du projet. Pour l’utiliser depuis un autre terminal ou ton éditeur, vois « Claude dans le terminal ».'),
    mcp: t('Your own claude, in a terminal or editor, drives Kinglet through its MCP server: screenshots, checks, previews.', 'Ton propre claude, dans un terminal ou un éditeur, pilote Kinglet grâce à son serveur MCP : captures, checks, aperçus.'),
    devices: t('Only checked devices appear in the project’s device bar, in this order. Drag a row to move it.', 'Seuls les appareils cochés apparaissent dans la barre des appareils du projet, dans cet ordre. Glisse une ligne pour la déplacer.'),
  };
  return (
    <div className="flex min-w-0 flex-1">
      <nav aria-label={t('Settings pages', 'Rubriques des réglages')} className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line-soft bg-chrome px-2.5 py-4">
        {nav.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5 pt-4 first:pt-0">
            <span className="label truncate px-2.5 pb-1.5">{g.group}</span>
            {g.items.map((it) => (
              <button
                key={it.id}
                aria-current={settingsTab === it.id ? 'page' : undefined}
                onClick={() => useStore.setState({ settingsTab: it.id })}
                className={`flex h-[30px] items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[12.5px] ${settingsTab === it.id ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
              >
                <Icon name={it.icon} size={13} />
                {it.label}
                {it.id === 'devices' && <span className="ml-auto font-mono text-[10px] text-ghost">{activePresets(s).length}</span>}
              </button>
            ))}
          </div>
        ))}
        <span className="flex-1" />
        <p className="m-0 px-2.5 pt-4 text-[11px] leading-normal text-ghost">
          Kinglet {platform?.version} · {t('saved in', 'enregistré dans')} ~/.config/Kinglet
        </p>
      </nav>
      <main className="flex min-w-0 flex-1 justify-center overflow-y-auto p-7">
        <div className="flex h-fit w-full max-w-[760px] flex-col gap-6 pb-8 [&>*]:shrink-0">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{current.label}</h1>
            {sub[settingsTab] && <p className="m-0 mt-1 text-muted">{sub[settingsTab]}</p>}
          </div>
          {settingsTab === 'general' ? (
            <GeneralSettings />
          ) : settingsTab === 'devices' ? (
            <DeviceSettings />
          ) : settingsTab === 'project' ? (
            <ProjectSettings />
          ) : settingsTab === 'vercel' ? (
            <VercelSettings />
          ) : settingsTab === 'github' ? (
            <GitHubSettings />
          ) : settingsTab === 'claude' ? (
            <ClaudePanelSettings />
          ) : settingsTab === 'mcp' ? (
            <>
              <McpSettings />
              <span className="label">{t('Follow terminal sessions', 'Suivre les sessions du terminal')}</span>
              <ClaudeSettings />
            </>
          ) : settingsTab === 'license' ? (
            <LicenseSettings />
          ) : (
            <UpdateSettings />
          )}
        </div>
      </main>
    </div>
  );
}
