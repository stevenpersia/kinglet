import { t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import { api, useStore } from '../store';

const btn = 'flex h-8 shrink-0 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';
const primary = 'flex h-8 shrink-0 items-center justify-center rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60';

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-[18px] w-[30px] shrink-0 rounded-full ${on ? 'bg-fg' : 'bg-raised shadow-[inset_0_0_0_1px_#34343a]'}`}>
      <span className={`absolute top-[3px] size-3 rounded-full transition-[left] motion-reduce:transition-none ${on ? 'left-[15px] bg-bg' : 'left-[3px] bg-faint'}`} />
    </button>
  );
}

/** Claude in Kinglet: the panel, what it may do, and the Claude Code it runs. */
export function ClaudePanelSettings() {
  const { settings, updateSettings } = useStore();
  const [cli, setCli] = useState<import('../../shared/types').ClaudeCli | null>(null);
  useEffect(() => {
    void api().chat.cli().then(setCli);
  }, []);
  const row = 'flex items-center gap-4 border-t border-line-soft px-3.5 py-3 first:border-t-0';
  return (
    <div className="shrink-0 overflow-hidden rounded-[10px] border border-line bg-card">
      <div className={row}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">Claude Code</span>
          <span className="truncate text-xs text-muted">
            {!cli ? '…' : cli.found ? `${cli.version ?? ''} · ${cli.path}` : t('Not installed: npm install -g @anthropic-ai/claude-code', 'Pas installé : npm install -g @anthropic-ai/claude-code')}
          </span>
        </div>
        <span className={`size-2 shrink-0 rounded-full ${cli?.found ? 'bg-ok' : 'bg-ghost'}`} aria-hidden="true" />
      </div>
      <div className={row}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{t('Claude panel', 'Panneau Claude')}</span>
          <span className="text-xs text-muted">{t('A terminal running your claude in the project folder, open by default in every project: your login, your commands, your settings. “Ask Claude” and “Show” put their context in its input. Fold it with Ctrl J.', 'Un terminal qui lance ton claude dans le dossier du projet, ouvert par défaut dans chaque projet : ton compte, tes commandes, tes réglages. « Demander à Claude » et « Montrer » mettent leur contexte dans sa saisie. Ctrl J pour le replier.')}</span>
        </div>
        <Switch label={t('Claude panel', 'Panneau Claude')} on={settings.claudePanel} onChange={(claudePanel) => void updateSettings({ claudePanel })} />
      </div>
    </div>
  );
}

/** Opt-in: Claude Code hooks that tell Kinglet what Claude is doing on each project. */
export function ClaudeSettings() {
  const hooks = useStore((s) => s.claudeHooks);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<NonNullable<typeof hooks>>) => {
    setBusy(true);
    useStore.setState({ claudeHooks: await fn() });
    setBusy(false);
  };
  const file = hooks?.file.replace(/^\/home\/[^/]+/, '~') ?? '~/.claude/settings.json';
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-3.5">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${hooks?.installed ? 'claude-dot bg-[#d97757]' : 'bg-ghost'}`} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{hooks?.installed ? t('Tracking on', 'Suivi activé') : t('Tracking off', 'Suivi désactivé')}</span>
          <span className="text-xs leading-5 text-muted">
            {t('Kinglet adds hooks to', 'Kinglet ajoute des hooks à')} <span className="font-mono text-fg">{file}</span>{' '}
            {t(
              '(a backup copy is kept next to it). On each request, changed file or task end, Claude Code sends the event to Kinglet, on your machine only. Each session is attached to the project whose folder contains it. Sessions already open must be restarted.',
              '(une copie de sauvegarde est gardée à côté). À chaque demande, fichier modifié ou fin de tâche, Claude Code envoie l’évènement à Kinglet, sur ta machine uniquement. Chaque session est rattachée au projet dont le dossier la contient. Les sessions déjà ouvertes doivent être relancées.',
            )}
          </span>
        </div>
        {hooks?.installed ? (
          <button disabled={busy} onClick={() => void run(() => api().claude.uninstall())} className={btn}>
            {t('Turn off', 'Désactiver')}
          </button>
        ) : (
          <button disabled={busy} onClick={() => void run(() => api().claude.install())} className={primary}>
            {t('Turn on', 'Activer')}
          </button>
        )}
      </div>
      {hooks?.error && <p className="m-0 text-xs text-err">{hooks.error}</p>}
    </div>
  );
}
