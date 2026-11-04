import { activePresets, useStore } from '../store';
import { Dot } from './Icons';

export function StatusBar() {
  const state = useStore();
  const { platform, url, status } = state;
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
      <span className="ml-auto">
        Parakeet {platform?.version}
        {platform?.isDev ? ' (dev)' : ''} · Electron {platform?.electron} · Chromium {platform?.chrome.split('.')[0]}
      </span>
    </footer>
  );
}
