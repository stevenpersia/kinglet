import { activePresets, useStore } from '../store';
import { Dot } from './Icons';

export function StatusBar() {
  const state = useStore();
  const { platform, url, status, mcp, update, setSection } = state;
  const calls = mcp?.activity.length ?? 0;
  const devices = activePresets(state);
  const dot = status === 'loaded' ? 'bg-ok' : status === 'failed' ? 'bg-err' : 'bg-ghost';
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-[18px] border-t border-line-soft bg-chrome px-3.5 font-mono text-[11px] text-faint">
      <span className="flex items-center gap-1.5">
        <Dot className={dot} />
        {url ? url.replace(/\/$/, '') : 'Aucun serveur (ports 3000, 5173, 4321…)'}
      </span>
      <span>{devices.length} appareil{devices.length > 1 ? 's' : ''}</span>
      <span>Session · {platform?.sessionType}</span>
      <span className="flex items-center gap-1.5">
        <Dot className={calls ? 'bg-ok' : 'bg-ghost'} />
        MCP · {calls ? `${calls} appel${calls > 1 ? 's' : ''}` : 'prêt'}
      </span>
      {update && (update.status === 'available' || update.status === 'downloading' || update.status === 'ready') && (
        <button onClick={() => setSection('reglages')} className="flex items-center gap-1.5 text-fg hover:underline">
          <Dot className={update.status === 'ready' ? 'bg-ok' : 'bg-local'} />
          {update.status === 'ready' ? `Parakeet ${update.latest} prêt à installer` : `Mise à jour ${update.latest}${update.percent != null ? ` · ${update.percent} %` : ''}`}
        </button>
      )}
      <span className="ml-auto">
        Parakeet {platform?.version}
        {platform?.isDev ? ' (dev)' : ''} · Electron {platform?.electron} · Chromium {platform?.chrome.split('.')[0]}
      </span>
    </footer>
  );
}
