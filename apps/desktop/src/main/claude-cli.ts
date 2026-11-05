import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { ClaudeCli } from '../shared/types';

/** Where Claude Code is usually installed, besides $PATH. */
const CANDIDATES = () => [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude'), '/usr/local/bin/claude', '/usr/bin/claude', '/opt/homebrew/bin/claude'];

export function findClaude(env = process.env): string | null {
  if (env.KINGLET_CLAUDE_BIN) return existsSync(env.KINGLET_CLAUDE_BIN) ? env.KINGLET_CLAUDE_BIN : null;
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const p = join(dir, 'claude');
    if (existsSync(p)) return p;
  }
  return CANDIDATES().find((p) => existsSync(p)) ?? null;
}

/** Claude Code on this computer, and its version. */
export async function claudeCli(): Promise<ClaudeCli> {
  const path = findClaude();
  if (!path) return { found: false, path: null, version: null };
  const version = await new Promise<string | null>((resolve) =>
    execFile(path, ['--version'], { timeout: 5000 }, (err, out) => resolve(err ? null : (out.trim().split(/\s+/)[0] ?? null))),
  );
  return { found: true, path, version };
}
