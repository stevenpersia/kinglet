import { t } from '@parakeet/core';
import type { ClaudeEvent, ClaudeProjectState } from '../shared/types';

/** Fields of a Claude Code hook payload that Parakeet reads. */
export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  agent_id?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; command?: string; description?: string; pattern?: string; url?: string };
  notification_type?: string;
  message?: string;
  error?: string;
  reason?: string;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MAX_EVENTS = 60;
/** Stop is not sent when the user interrupts Claude: a silent session goes back to idle. */
export const IDLE_AFTER_MS = 10 * 60_000;

const clip = (s: string | undefined, n = 140) => {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};
const rel = (file: string, folder: string | null) => (folder && file.startsWith(`${folder.replace(/\/+$/, '')}/`) ? file.slice(folder.replace(/\/+$/, '').length + 1) : file);

/** What a tool call does, in a few words. */
export function describeTool(p: HookPayload, folder: string | null): { text: string; file?: string } {
  const i = p.tool_input ?? {};
  const file = i.file_path ?? i.notebook_path;
  if (p.tool_name && EDIT_TOOLS.has(p.tool_name) && file) return { text: `${p.tool_name === 'Write' ? t('writes', 'écrit') : t('edits', 'édite')} ${rel(file, folder)}`, file: rel(file, folder) };
  if (p.tool_name === 'Bash') return { text: t(`runs ${clip(i.description || i.command, 60)}`, `lance ${clip(i.description || i.command, 60)}`) };
  if (p.tool_name === 'Read' && file) return { text: t(`reads ${rel(file, folder)}`, `lit ${rel(file, folder)}`) };
  if (p.tool_name === 'Grep' || p.tool_name === 'Glob') return { text: t(`searches ${clip(i.pattern, 40)}`, `cherche ${clip(i.pattern, 40)}`) };
  if (p.tool_name === 'WebFetch' || p.tool_name === 'WebSearch') return { text: t('searches the web', 'cherche sur le web') };
  return { text: p.tool_name ?? t('tool', 'outil') };
}

const empty = (now: number): ClaudeProjectState => ({ status: 'idle', since: now, lastAt: now, prompt: null, lastAction: null, files: [], seen: true, events: [] });

/**
 * Claude Code activity per project, from hook events. A project is "working" while one of its
 * sessions has a prompt running; "waiting" when Claude asks for a permission; "done" after Stop.
 */
export class ClaudeTracker {
  projects: Record<string, ClaudeProjectState> = {};
  /** Sessions with a task running, per project. */
  private running = new Map<string, Set<string>>();

  /** Apply one hook event. Returns what changed (null when ignored). */
  ingest(p: HookPayload, project: { id: string; folder: string | null } | null, now = Date.now()): { event: ClaudeEvent; finished: boolean } | null {
    const name = p.hook_event_name;
    const sessionId = p.session_id ?? '?';
    const projectId = project?.id ?? null;
    let event: ClaudeEvent;
    switch (name) {
      case 'SessionStart':
        event = { at: now, projectId, sessionId, kind: 'start' };
        break;
      case 'UserPromptSubmit':
        event = { at: now, projectId, sessionId, kind: 'prompt', text: clip(p.prompt) };
        break;
      case 'PostToolUse': {
        const d = describeTool(p, project?.folder ?? null);
        event = { at: now, projectId, sessionId, kind: 'tool', tool: p.tool_name, file: d.file, text: d.text };
        break;
      }
      case 'Notification':
        // idle_prompt: Claude finished and waits for the next prompt (Stop already said so).
        if (p.notification_type === 'idle_prompt') return null;
        event = { at: now, projectId, sessionId, kind: 'waiting', text: clip(p.message) || t('Claude is waiting for your reply', 'Claude attend ta réponse') };
        break;
      case 'Stop':
        if (p.agent_id) return null; // a subagent finished, not the task
        event = { at: now, projectId, sessionId, kind: 'stop' };
        break;
      case 'StopFailure':
        event = { at: now, projectId, sessionId, kind: 'error', text: clip(p.error ?? p.reason ?? p.message, 120) };
        break;
      case 'SessionEnd':
        event = { at: now, projectId, sessionId, kind: 'end' };
        break;
      default:
        return null;
    }
    // Events outside any known project still show in the feed, under "no project".
    const key = projectId ?? '';
    const prev = this.projects[key] ?? empty(now);
    const running = this.running.get(key) ?? new Set<string>();
    this.running.set(key, running);
    const next: ClaudeProjectState = { ...prev, lastAt: now, events: [event, ...prev.events].slice(0, MAX_EVENTS) };
    let finished = false;

    if (event.kind === 'prompt') {
      if (!running.size || prev.status !== 'working') Object.assign(next, { status: 'working', since: now, files: [], seen: false });
      running.add(sessionId);
      next.prompt = event.text ?? null;
      next.lastAction = null;
    } else if (event.kind === 'tool') {
      running.add(sessionId);
      if (prev.status !== 'working') Object.assign(next, { status: 'working', since: prev.status === 'waiting' ? prev.since : now, seen: false });
      next.lastAction = `Claude ${event.text}`;
      if (event.file && !next.files.includes(event.file)) next.files = [...next.files, event.file];
    } else if (event.kind === 'waiting') {
      Object.assign(next, { status: 'waiting', lastAction: event.text });
    } else if (event.kind === 'stop' || event.kind === 'error') {
      running.delete(sessionId);
      if (!running.size) {
        Object.assign(next, { status: 'done', since: now, seen: false, lastAction: event.kind === 'error' ? t(`Error: ${event.text || 'the request failed'}`, `Erreur : ${event.text || 'la requête a échoué'}`) : prev.lastAction });
        finished = true;
      }
    } else if (event.kind === 'end') {
      running.delete(sessionId);
      if (!running.size && (prev.status === 'working' || prev.status === 'waiting')) next.status = 'idle';
    }
    this.projects[key] = next;
    return { event, finished };
  }

  markSeen(projectId: string) {
    const p = this.projects[projectId];
    if (!p || p.seen) return false;
    this.projects[projectId] = { ...p, seen: true };
    return true;
  }

  /** Sessions silent for too long (interrupted, crashed) stop counting as working. */
  expire(now = Date.now()) {
    let changed = false;
    for (const [id, p] of Object.entries(this.projects)) {
      if ((p.status === 'working' || p.status === 'waiting') && now - p.lastAt > IDLE_AFTER_MS) {
        this.projects[id] = { ...p, status: 'idle', since: now };
        this.running.delete(id);
        changed = true;
      }
    }
    return changed;
  }
}
