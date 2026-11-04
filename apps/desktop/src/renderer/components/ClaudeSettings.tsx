import { t } from '@parakeet/core';
import { useState } from 'react';
import { api, useStore } from '../store';

const btn = 'flex h-8 shrink-0 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';
const primary = 'flex h-8 shrink-0 items-center justify-center rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60';

/** Opt-in: Claude Code hooks that tell Parakeet what Claude is doing on each project. */
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
            {t('Parakeet adds hooks to', 'Parakeet ajoute des hooks à')} <span className="font-mono text-fg">{file}</span>{' '}
            {t(
              '(a backup copy is kept next to it). On each request, changed file or task end, Claude Code sends the event to Parakeet, on your machine only. Each session is attached to the project whose folder contains it. Sessions already open must be restarted.',
              '(une copie de sauvegarde est gardée à côté). À chaque demande, fichier modifié ou fin de tâche, Claude Code envoie l’évènement à Parakeet, sur ta machine uniquement. Chaque session est rattachée au projet dont le dossier la contient. Les sessions déjà ouvertes doivent être relancées.',
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
