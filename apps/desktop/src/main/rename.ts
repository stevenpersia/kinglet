import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/** The app's name before Kinglet. Its data folder and Claude Code hooks are moved over once. */
export const OLD_NAME = 'Parakeet';

/**
 * Moves <appData>/Parakeet to <appData>/Kinglet the first time Kinglet starts, so settings,
 * accounts and feedback carry over. Does nothing when Kinglet's folder already exists.
 */
export function moveOldUserData(appData: string, name = 'Kinglet'): boolean {
  const from = join(appData, OLD_NAME);
  const to = join(appData, name);
  if (existsSync(to) || !existsSync(from)) return false;
  try {
    renameSync(from, to);
    return true;
  } catch {
    return false;
  }
}

/** Where the hook script lived under the old name. */
export const oldHookScript = (appData: string) => join(appData, OLD_NAME, 'claude-hook.sh');
