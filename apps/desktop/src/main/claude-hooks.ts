import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { t } from '@kinglet/core';
import type { ClaudeHookState } from '../shared/types';

/** Claude Code events Kinglet listens to. */
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'StopFailure', 'SessionEnd'] as const;

interface HookCommand {
  type: string;
  command?: string;
  async?: boolean;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}
type ClaudeSettings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };

/** Claude Code's user settings (CLAUDE_CONFIG_DIR moves them). */
export const claudeSettingsFile = (env = process.env, home = homedir()) => join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json');

const ours = (h: HookCommand, command: string) => h.type === 'command' && h.command === command;

export function hasHooks(s: ClaudeSettings, command: string) {
  return HOOK_EVENTS.every((e) => s.hooks?.[e]?.some((g) => g.hooks?.some((h) => ours(h, command))));
}

/** Add one async command hook per event (idempotent). The user's own hooks are left as they are. */
export function addHooks(s: ClaudeSettings, command: string): ClaudeSettings {
  const hooks = { ...(s.hooks ?? {}) };
  for (const e of HOOK_EVENTS) {
    const groups = hooks[e] ?? [];
    if (groups.some((g) => g.hooks?.some((h) => ours(h, command)))) continue;
    const group: HookGroup = { hooks: [{ type: 'command', command, async: true, timeout: 5 }] };
    if (e === 'PostToolUse') group.matcher = '*';
    hooks[e] = [...groups, group];
  }
  return { ...s, hooks };
}

/** Remove Kinglet's hooks, and only them. */
export function removeHooks(s: ClaudeSettings, command: string): ClaudeSettings {
  if (!s.hooks) return s;
  const hooks: Record<string, HookGroup[]> = {};
  for (const [e, groups] of Object.entries(s.hooks)) {
    const kept = groups.map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !ours(h, command)) })).filter((g) => g.hooks.length);
    if (kept.length) hooks[e] = kept;
  }
  const { hooks: _, ...rest } = s;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

/**
 * The hook: forwards the event (JSON on stdin) to Kinglet's local server, if Kinglet runs.
 * Never blocks or fails Claude Code: short timeout, no output, always exit 0.
 */
export const hookScript = (envFile: string) => `#!/bin/sh
# Kinglet: sends Claude Code hook events to the Kinglet app (127.0.0.1 only).
# Installed from Kinglet's settings; remove it there (or delete the "hooks" entries pointing here).
ENV_FILE='${envFile.replace(/'/g, `'\\''`)}'
[ -r "$ENV_FILE" ] || { cat >/dev/null; exit 0; }
PORT=$(sed -n 's/^PORT=//p' "$ENV_FILE")
TOKEN=$(sed -n 's/^TOKEN=//p' "$ENV_FILE")
[ -n "$PORT" ] && [ -n "$TOKEN" ] || { cat >/dev/null; exit 0; }
curl -s -m 2 -o /dev/null -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' --data-binary @- "http://127.0.0.1:$PORT/claude-event" >/dev/null 2>&1
exit 0
`;

export class ClaudeHooks {
  readonly script: string;
  readonly envFile: string;
  readonly file: string;
  private error: string | null = null;

  constructor(userData: string, file = claudeSettingsFile()) {
    this.script = join(userData, 'claude-hook.sh');
    this.envFile = join(userData, 'hook.env');
    this.file = file;
  }

  private read(): ClaudeSettings {
    if (!existsSync(this.file)) return {};
    const raw = readFileSync(this.file, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw); // throws on a broken file: never overwrite it
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('unexpected format', 'format inattendu'));
    return parsed;
  }

  private write(s: ClaudeSettings) {
    mkdirSync(dirname(this.file), { recursive: true });
    const backup = `${this.file}.kinglet-backup`;
    if (existsSync(this.file) && !existsSync(backup)) copyFileSync(this.file, backup);
    writeFileSync(this.file, `${JSON.stringify(s, null, 2)}\n`);
  }

  state(): ClaudeHookState {
    try {
      return { installed: hasHooks(this.read(), this.script), file: this.file, error: this.error };
    } catch (e) {
      return { installed: false, file: this.file, error: t(`${this.file} is unreadable: ${(e as Error).message}`, `${this.file} illisible : ${(e as Error).message}`) };
    }
  }

  install(): ClaudeHookState {
    try {
      mkdirSync(dirname(this.script), { recursive: true });
      writeFileSync(this.script, hookScript(this.envFile), { mode: 0o700 });
      chmodSync(this.script, 0o700);
      this.write(addHooks(this.read(), this.script));
      this.error = null;
    } catch (e) {
      this.error = t(`Couldn’t install: ${(e as Error).message}`, `Installation impossible : ${(e as Error).message}`);
    }
    return this.state();
  }

  /** Hooks installed under the app's old name point to a script that is gone: point them here. */
  repoint(oldScript: string): boolean {
    if (oldScript === this.script) return false;
    try {
      const s = this.read();
      if (!HOOK_EVENTS.some((e) => s.hooks?.[e]?.some((g) => g.hooks?.some((h) => ours(h, oldScript))))) return false;
      mkdirSync(dirname(this.script), { recursive: true });
      writeFileSync(this.script, hookScript(this.envFile), { mode: 0o700 });
      chmodSync(this.script, 0o700);
      this.write(addHooks(removeHooks(s, oldScript), this.script));
      return true;
    } catch {
      return false;
    }
  }

  uninstall(): ClaudeHookState {
    try {
      this.write(removeHooks(this.read(), this.script));
      rmSync(this.script, { force: true });
      this.error = null;
    } catch (e) {
      this.error = t(`Couldn’t uninstall: ${(e as Error).message}`, `Désinstallation impossible : ${(e as Error).message}`);
    }
    return this.state();
  }

  /** Where the hook finds the running app (rewritten at each start, removed on quit). */
  publish(port: number, token: string) {
    writeFileSync(this.envFile, `PORT=${port}\nTOKEN=${token}\n`, { mode: 0o600 });
    chmodSync(this.envFile, 0o600);
  }

  unpublish() {
    rmSync(this.envFile, { force: true });
  }
}
