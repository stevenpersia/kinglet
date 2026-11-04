import { locale, t } from '@parakeet/core';
import type { Language } from '../../shared/types';
import { useState } from 'react';
import { api, useStore } from '../store';
import { Icon } from './Icons';
import { ActivityList, CopyButton, SLASH } from './Mcp';
import { ProjectSettings, VercelSettings } from './VercelSettings';
import { ClaudeSettings } from './ClaudeSettings';
import { activeProject } from '../../shared/projects';

const tools = (): [string, string][] => [
  ['status', t('Open page and emulated devices', 'Page ouverte et appareils émulés')],
  ['open_url', t('Opens a URL on every device', 'Ouvre une URL sur tous les appareils')],
  ['set_devices', t('Changes the emulated devices', 'Change les appareils émulés')],
  ['screenshot', t('Captures each device (Claude sees the render)', 'Capture chaque appareil (Claude voit le rendu)')],
  ['get_page_meta', t('Tags as read by a share crawler', 'Balises lues comme un robot de partage')],
  ['get_share_preview', t('Previews on 7 platforms + fix', 'Aperçus sur 7 plateformes + correctif')],
  ['run_checks', t('All 24 checks, including on-device measurements', 'Les 24 checks, mesures dans les appareils incluses')],
  ['list_pages', t('Site pages', 'Pages du site')],
  ['list_deployments', t('Vercel deployments of the linked project', 'Déploiements Vercel du projet lié')],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function LanguageSetting() {
  const { settings, updateSettings } = useStore();
  const options: { id: Language; label: string }[] = [
    { id: 'en', label: 'English' },
    { id: 'fr', label: 'Français' },
  ];
  return (
    <div role="radiogroup" aria-label={t('Language', 'Langue')} className="flex w-fit gap-0.5 rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={settings.language === o.id}
          onClick={() => void updateSettings({ language: o.id })}
          className={`flex h-7 items-center rounded-md px-3 text-xs font-medium ${settings.language === o.id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
    none: t('Parakeet is up to date.', 'Parakeet est à jour.'),
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
          Parakeet {update.current} <span className="font-normal text-muted">· {KIND[update.kind]}</span>
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

export function SettingsPage() {
  const mcp = useStore((s) => s.mcp);
  const platform = useStore((s) => s.platform);
  const last = mcp?.activity[0];

  return (
    <main className="flex min-w-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-[880px] flex-col gap-8">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Settings', 'Réglages')}</h1>
          <p className="m-0 mt-1 text-muted">Parakeet {platform?.version} · {t('settings saved in', 'réglages enregistrés dans')} ~/.config/Parakeet</p>
        </div>

        <Section title={t('Language', 'Langue')}>
          <LanguageSetting />
        </Section>

        <Section title={`${t('Active project', 'Projet actif')}${activeProject(useStore.getState().settings) ? ` · ${activeProject(useStore.getState().settings)!.name}` : ''}`}>
          <ProjectSettings />
        </Section>

        <Section title={t('Claude Code activity', 'Suivi de Claude Code')}>
          <ClaudeSettings />
        </Section>

        <Section title={t('Updates', 'Mises à jour')}>
          <UpdateSettings />
        </Section>

        <Section title={t('MCP server for Claude Code', 'Serveur MCP pour Claude Code')}>
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
                    : t('No calls since Parakeet started.', 'Aucun appel depuis le lancement de Parakeet.')}
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
                  'makes Parakeet available in all your projects. The server also works with the app closed, except for screenshots and on-device measurements.',
                  'rend Parakeet disponible dans tous tes projets. Le serveur marche aussi app fermée, sauf pour les captures et les mesures dans les appareils.',
                )}
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-line-soft p-3.5">
              <span className="label">{t('2. Use', '2. Utiliser')}</span>
              <span className="text-xs text-muted">
                {t(
                  'Just ask Claude “check the home page on iPhone with Parakeet”, or run one of these commands in Claude Code:',
                  'Demande simplement à Claude « vérifie la home sur iPhone avec Parakeet », ou lance une de ces commandes dans Claude Code :',
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
        </Section>

        <Section title={t('Vercel account', 'Compte Vercel')}>
          <VercelSettings />
        </Section>
      </div>
    </main>
  );
}
