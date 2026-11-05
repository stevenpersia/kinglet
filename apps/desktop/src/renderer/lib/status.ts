import { t, type VercelDeployment } from '@kinglet/core';
import type { ClaudeProjectState } from '../../shared/types';

export type ProjectStatusKind = 'working' | 'waiting' | 'review' | 'building' | 'error' | 'idle';

export interface ProjectStatus {
  kind: ProjectStatusKind;
  /** Short text for a tab. */
  short: string;
  /** One line for tooltips and cards. */
  label: string;
  detail: string | null;
  color: string;
}

export const CLAY = '#d97757';

const minutes = (since: number, now: number) => {
  const m = Math.max(0, Math.floor((now - since) / 60_000));
  return m < 1 ? '< 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`;
};
const base = (path: string) => path.split('/').slice(-2).join('/');

/**
 * One status per project, most important first: Claude working, Claude waiting for you,
 * a finished task you have not looked at, a build in progress, a failed build, idle.
 */
export function projectStatus(claude: ClaudeProjectState | undefined, deployments: VercelDeployment[], now = Date.now()): ProjectStatus {
  if (claude?.status === 'working')
    return { kind: 'working', short: minutes(claude.since, now), label: t(`Claude is working · ${minutes(claude.since, now)}`, `Claude travaille · ${minutes(claude.since, now)}`), detail: claude.lastAction ?? claude.prompt, color: CLAY };
  if (claude?.status === 'waiting') return { kind: 'waiting', short: t('waiting', 'attend'), label: t('Claude is waiting for you', 'Claude attend ta réponse'), detail: claude.lastAction, color: '#e6c07b' };
  if (claude?.status === 'done' && !claude.seen) {
    const n = claude.files.length;
    return {
      kind: 'review',
      short: t('to review', 'à voir'),
      label: t(`Claude finished ${minutes(claude.lastAt, now)} ago`, `Claude a terminé il y a ${minutes(claude.lastAt, now)}`),
      detail: n
        ? t(`${n} file${n > 1 ? 's' : ''} changed: `, `${n} fichier${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''} : `) + `${claude.files.slice(0, 3).map(base).join(', ')}${n > 3 ? '…' : ''}`
        : null,
      color: '#ededef',
    };
  }
  const latest = deployments[0];
  if (latest && (latest.state === 'BUILDING' || latest.state === 'QUEUED' || latest.state === 'INITIALIZING'))
    return { kind: 'building', short: 'build', label: t(`Building · ${latest.branch ?? ''}`, `Build en cours · ${latest.branch ?? ''}`), detail: latest.commitMessage, color: '#e6c07b' };
  if (latest?.state === 'ERROR') return { kind: 'error', short: t('error', 'erreur'), label: t(`Build failed · ${latest.branch ?? ''}`, `Build en erreur · ${latest.branch ?? ''}`), detail: latest.commitMessage, color: '#f28b82' };
  return { kind: 'idle', short: '', label: t('Idle', 'Au repos'), detail: null, color: '#6e6e77' };
}

/** A stable colour for a project's initials. */
const PALETTE = ['#2f5d50', '#3b3b44', '#5b4a8b', '#8b5a2b', '#2b5a8b', '#7a3b4f', '#4d6b2f', '#2f6b6b'];
export function projectColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(name: string) {
  const port = /^([^:/]+):(\d+)/.exec(name.replace(/^https?:\/\//, ''));
  if (port) return (port[1]![0]! + port[2]![0]!).toUpperCase(); // localhost:5173 → L5
  const words = name.replace(/^https?:\/\//, '').split(/[-_.\s:/]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
}
