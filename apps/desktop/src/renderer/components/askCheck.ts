import { t, type CheckResult } from '@kinglet/core';
import { useStore } from '../store';

/** "Ask Claude" on a failing check, when the Claude panel is on. */
export function askCheck(): ((c: CheckResult) => void) | undefined {
  const s = useStore.getState();
  if (!s.settings.claudePanel) return undefined;
  return (c) =>
    useStore.getState().askClaude(
      t(`Fix this check on ${s.url ?? 'the page'}: ${c.label}. ${c.detail}`, `Corrige ce check sur ${s.url ?? 'la page'} : ${c.label}. ${c.detail}`),
    );
}
