import { t } from '@kinglet/core';
import { activePresets, useStore } from '../store';
import { Dot } from './Icons';
import { DevServerStatus } from './DevServer';

export function StatusBar() {
  const state = useStore();
  const { platform, url, status, mcp, update } = state;
  const calls = mcp?.activity.length ?? 0;
  const devices = activePresets(state);
  const dot = status === 'loaded' ? 'bg-ok' : status === 'failed' ? 'bg-err' : 'bg-ghost';
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-[18px] border-t border-line-soft bg-chrome px-3.5 font-mono text-[11px] text-faint">
      <span className="flex items-center gap-1.5">
        <Dot className={dot} />
        {url ? url.replace(/\/$/, '') : t('No server (ports 3000, 5173, 4321…)', 'Aucun serveur (ports 3000, 5173, 4321…)')}
      </span>
      <DevServerStatus />
      <span>{t(`${devices.length} device${devices.length > 1 ? 's' : ''}`, `${devices.length} appareil${devices.length > 1 ? 's' : ''}`)}</span>
      <span>Session · {platform?.sessionType}</span>
      <span className="flex items-center gap-1.5">
        <Dot className={calls ? 'bg-ok' : 'bg-ghost'} />
        MCP · {calls ? t(`${calls} call${calls > 1 ? 's' : ''}`, `${calls} appel${calls > 1 ? 's' : ''}`) : t('ready', 'prêt')}
      </span>
      {update && (update.status === 'available' || update.status === 'downloading' || update.status === 'ready') && (
        <button onClick={() => useStore.getState().openSettings('updates')} className="flex items-center gap-1.5 text-fg hover:underline">
          <Dot className={update.status === 'ready' ? 'bg-ok' : 'bg-local'} />
          {update.status === 'ready'
            ? t(`Kinglet ${update.latest} ready to install`, `Kinglet ${update.latest} prêt à installer`)
            : t(`Update ${update.latest}${update.percent != null ? ` · ${update.percent}%` : ''}`, `Mise à jour ${update.latest}${update.percent != null ? ` · ${update.percent} %` : ''}`)}
        </button>
      )}
      <span className="ml-auto">
        Kinglet {platform?.version}
        {platform?.isDev ? ' (dev)' : ''} · Electron {platform?.electron} · Chromium {platform?.chrome.split('.')[0]}
      </span>
    </footer>
  );
}
