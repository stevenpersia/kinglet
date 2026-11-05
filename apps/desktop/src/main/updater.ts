import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { t } from '@kinglet/core';
import type { UpdateState } from '../shared/types';

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** How this copy was installed (electron-builder writes resources/package-type for pacman/deb/rpm). */
function installKind(): UpdateState['kind'] {
  if (process.env.APPIMAGE) return 'appimage';
  const file = join(process.resourcesPath, 'package-type');
  const type = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  return type === 'pacman' ? 'pacman' : type ? 'other' : 'unknown';
}

const explain = (e: Error) => {
  const m = e.message;
  if (/404|Not Found|Unable to find latest version/i.test(m)) return t('No release found on GitHub yet.', 'Aucune release trouvée sur GitHub pour l’instant.');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(m)) return t('No connection to GitHub.', 'Pas de connexion à GitHub.');
  return m.split('\n')[0]!;
};

/**
 * Updates from GitHub Releases (AppImage and pacman). Downloads in the background, installs only
 * when asked: for the pacman package, installing asks for the administrator password (pkexec).
 */
export class Updater {
  state: UpdateState;
  private timer: NodeJS.Timeout | null = null;

  constructor(private emit: (s: UpdateState) => void) {
    const kind = installKind();
    const supported = app.isPackaged && (kind === 'appimage' || kind === 'pacman');
    this.state = { current: app.getVersion(), kind, status: supported ? 'idle' : 'unsupported', latest: null, percent: null, error: null, checkedAt: null };
    if (!supported) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
    // Releases come from the public stevenpersia/kinglet-releases (electron-builder.yml); tests point the updater at a local server.
    if (process.env.KINGLET_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.KINGLET_UPDATE_URL });

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'none', checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info: UpdateInfo) => this.set({ status: 'available', latest: info.version, checkedAt: Date.now() }));
    autoUpdater.on('download-progress', (p: ProgressInfo) => this.set({ status: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => this.set({ status: 'ready', latest: info.version, percent: 100 }));
    autoUpdater.on('error', (e: Error) => this.set({ status: 'error', error: explain(e), checkedAt: Date.now() }));
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  start(firstDelayMs = 10_000) {
    if (this.state.status === 'unsupported') return;
    setTimeout(() => void this.check(), firstDelayMs);
    this.timer = setInterval(() => void this.check(), SIX_HOURS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async check() {
    if (this.state.status === 'unsupported' || this.state.status === 'downloading' || this.state.status === 'ready') return this.state;
    await autoUpdater.checkForUpdates().catch(() => undefined); // errors arrive through the 'error' event
    return this.state;
  }

  /** Quit and install the downloaded version (pacman: password prompt), then relaunch. */
  install() {
    if (this.state.status === 'ready') autoUpdater.quitAndInstall(false, true);
  }
}
