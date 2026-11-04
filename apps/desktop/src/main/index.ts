import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { checkShare, probeImage, readPageMeta } from '@parakeet/core';
import type { DeviceSlot, InitState, PreviewEvent, ShareReport } from '../shared/types';
import { detectLocalServer } from './detect';
import { DeviceManager } from './devices';
import { DEFAULT_ACTIVE, PRESETS } from './presets';
import { runSelftest } from './selftest';

// Linux: let Chromium pick Wayland when the session is Wayland, X11 otherwise.
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

/** Vercel Deployment Protection bypass ("Protection Bypass for Automation" secret). */
const BYPASS_SECRET = process.env.PARAKEET_VERCEL_BYPASS ?? '';
const BYPASS_HOSTS = (process.env.PARAKEET_BYPASS_HOSTS ?? '*.vercel.app').split(',').map((h) => h.trim()).filter(Boolean);

const hostMatches = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return BYPASS_HOSTS.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p));
  } catch {
    return false;
  }
};
const bypassHeaders = (url: string): Record<string, string> =>
  BYPASS_SECRET && hostMatches(url) ? { 'x-vercel-protection-bypass': BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } : {};

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0A0A0B',
    title: 'Parakeet',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/ui.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });

  const emit = (e: PreviewEvent) => win.webContents.send('preview:event', e);
  const devices = new DeviceManager(win, PRESETS, emit);

  devices.session.webRequest.onBeforeSendHeaders((details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, ...bypassHeaders(details.url) } });
  });

  ipcMain.handle('app:init', async (): Promise<InitState> => {
    let url = process.env.PARAKEET_URL ?? null;
    let detectedFrom: string | null = url ? 'PARAKEET_URL' : null;
    if (!url) {
      url = await detectLocalServer();
      if (url) detectedFrom = 'détection auto';
    }
    devices.setActive(DEFAULT_ACTIVE);
    if (url) void devices.navigate(url);
    return {
      presets: PRESETS,
      active: DEFAULT_ACTIVE,
      url,
      detectedFrom,
      platform: {
        sessionType: process.env.XDG_SESSION_TYPE ?? 'inconnu',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
    };
  });
  ipcMain.handle('preview:navigate', (_e, url: string) => devices.navigate(url));
  ipcMain.handle('preview:reload', () => devices.reload());
  ipcMain.handle('preview:set-active', (_e, ids: string[]) => {
    devices.setActive(ids);
    if (devices.currentUrl) void devices.navigate(devices.currentUrl);
  });
  ipcMain.on('preview:layout', (_e, slots: DeviceSlot[]) => devices.setLayout(slots));
  ipcMain.on('preview:scroll-sync', (_e, on: boolean) => devices.setScrollSync(on));
  ipcMain.handle('share:read', async (_e, url: string): Promise<ShareReport> => {
    const headers = bypassHeaders(url);
    const meta = await readPageMeta(url, { headers });
    const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : null;
    return { meta, image, issues: checkShare(meta, image) };
  });
  ipcMain.on('window:control', (_e, action: string) => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(join(__dirname, '../renderer/index.html'));

  if (process.env.PARAKEET_SELFTEST) void runSelftest(win, devices, process.env.PARAKEET_SELFTEST);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
