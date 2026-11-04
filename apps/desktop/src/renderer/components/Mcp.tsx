import { useState } from 'react';
import { locale, t } from '@parakeet/core';
import type { McpActivity } from '../../shared/types';
import { api, useStore } from '../store';
import { Dot } from './Icons';

export const SLASH = { share: '/mcp__parakeet__fix_share', checks: '/mcp__parakeet__fix_checks' } as const;

/** A button that copies a text and says so for a moment. */
export function CopyButton({ text, label, done = t('Copied ✓', 'Copié ✓'), primary = false, className = '' }: { text: string; label: string; done?: string; primary?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        api().copy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`flex h-8 items-center justify-center gap-2 rounded-ui px-3 ${primary ? 'bg-fg font-semibold text-bg' : 'border border-[#2a2a2f] bg-active font-medium text-fg hover:border-line-strong'} ${className}`}
    >
      {copied ? done : label}
    </button>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ActivityList({ items, limit = 50 }: { items: McpActivity[]; limit?: number }) {
  if (!items.length) return <p className="m-0 text-faint">{t('No calls yet.', 'Aucun appel pour l’instant.')}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 font-mono text-[11.5px]">
      {items.slice(0, limit).map((a) => (
        <li key={`${a.at}-${a.tool}`} className="flex gap-2">
          <span className="shrink-0 text-ghost">{time(a.at)}</span>
          <Dot className={`mt-1.5 ${a.ok ? 'bg-ok' : 'bg-err'}`} />
          <span className="min-w-0">
            <span className="text-fg">{a.tool}</span> <span className="break-all text-muted">{a.detail}</span> <span className="text-ghost">{a.ms} ms</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Inspector tab: what Claude Code asked Parakeet. */
export function McpTab() {
  const mcp = useStore((s) => s.mcp);
  const setSection = useStore((s) => s.setSection);
  if (!mcp) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label">{t('Claude Code activity', 'Activité de Claude Code')}</span>
        <ActivityList items={mcp.activity} limit={30} />
      </div>
      {!mcp.activity.length && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-3">
          <span className="text-xs leading-relaxed text-muted">
            {t(
              'Connect Parakeet to Claude Code once, then ask it, for example, “check the page on mobile with Parakeet”.',
              'Branche Parakeet à Claude Code une fois pour toutes, puis demande-lui par exemple « vérifie la page sur mobile avec Parakeet ».',
            )}
          </span>
          <CopyButton text={mcp.command} label={t('Copy the install command', 'Copier la commande d’installation')} primary />
          <button onClick={() => setSection('reglages')} className="text-xs text-muted hover:text-fg">
            {t('Details in Settings →', 'Détails dans les réglages →')}
          </button>
        </div>
      )}
    </div>
  );
}
