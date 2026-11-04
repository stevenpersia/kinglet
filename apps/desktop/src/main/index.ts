import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { checkShare, crawl, probeImage, readPageMeta, readSiteFiles, runChecks, score, type CrawledPage, type SiteFiles } from '@parakeet/core';
import type { AnalyzeReport, DeviceSlot, InitState, PreviewEvent, Settings } from '../shared/types';
import { detectLocalServer } from './detect';
import { DeviceManager, shortcutFor } from './devices';
import { PRESETS } from './presets';
import { runSelftest } from './selftest';
import { SettingsStore } from './settings';

app.setName('Parakeet');
// The acceptance run must not read or write the user's real settings.
if (process.env.PARAKEET_SELFTEST) app.setPath('userData', join(process.env.PARAKEET_SELFTEST, 'userdata'));
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
  const settings = new SettingsStore();
  // Frameless window with our own title bar: no default menu (it would also steal Ctrl+R).
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0A0A0B',
    title: 'Parakeet',
    icon: join(__dirname, '../../build/icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/ui.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });

  const emit = (e: PreviewEvent) => {
    if (!win.isDestroyed()) win.webContents.send('app:event', e);
  };
  const devices = new DeviceManager(win, PRESETS, emit);
  devices.setScrollSync(settings.value.scrollSync);
  devices.setLandscape(settings.value.landscape);

  devices.session.webRequest.onBeforeSendHeaders((details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, ...bypassHeaders(details.url) } });
  });

  ipcMain.handle('app:init', async (): Promise<InitState> => {
    let url = process.env.PARAKEET_URL ?? null;
    let detectedFrom: string | null = url ? 'PARAKEET_URL' : null;
    if (!url) {
      url = await detectLocalServer();
      if (url) detectedFrom = 'détecté';
    }
    if (!url && settings.value.url) {
      url = settings.value.url;
      detectedFrom = 'dernière session';
    }
    devices.setActive(settings.value.active);
    if (url) {
      settings.update({ url });
      void devices.navigate(url);
    }
    return {
      presets: PRESETS,
      settings: settings.value,
      url,
      detectedFrom,
      platform: {
        sessionType: process.env.XDG_SESSION_TYPE ?? 'inconnu',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        version: app.getVersion(),
        isDev: !app.isPackaged,
      },
    };
  });
  ipcMain.handle('preview:navigate', (_e, url: string) => {
    settings.update({ url });
    return devices.navigate(url);
  });
  ipcMain.handle('preview:reload', () => devices.reload());
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const next = settings.update(patch);
    // New devices load the current page; existing ones keep theirs.
    if (patch.active) devices.setActive(next.active);
    if (patch.scrollSync !== undefined) devices.setScrollSync(patch.scrollSync);
    if (patch.landscape !== undefined) devices.setLandscape(patch.landscape);
    return next;
  });
  ipcMain.on('preview:layout', (_e, slots: DeviceSlot[]) => devices.setLayout(slots));
  ipcMain.on('preview:visible', (_e, visible: boolean) => devices.setVisible(visible));
  ipcMain.handle('preview:freeze', () => devices.freeze());
  ipcMain.on('preview:unfreeze', () => devices.unfreeze());
  ipcMain.on('preview:devtools', (_e, id: string) => devices.openDevtools(id));
  // Site-wide files and crawl results are cached per origin (they rarely change while you work on a page).
  const siteCache = new Map<string, Promise<SiteFiles>>();
  const crawlCache = new Map<string, Promise<CrawledPage[]>>();
  const origin = (u: string) => new URL(u).origin;

  ipcMain.handle('page:analyze', async (_e, url: string, opts: { refreshSite?: boolean }): Promise<AnalyzeReport> => {
    const headers = bypassHeaders(url);
    const [meta, rendered] = await Promise.all([readPageMeta(url, { headers }), devices.measure()]);
    const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : null;
    const key = origin(meta.finalUrl);
    if (opts.refreshSite || !siteCache.has(key)) siteCache.set(key, readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }));
    const site = await siteCache.get(key)!.catch(() => null);
    const checks = runChecks({ meta, image, site, rendered: rendered.devices });
    return { url, share: { meta, image, issues: checkShare(meta, image) }, site, checks, score: score(checks) };
  });

  ipcMain.handle('site:crawl', async (_e, url: string, opts: { force?: boolean }) => {
    const key = origin(url);
    if (opts.force || !crawlCache.has(key)) {
      const job = (async () => {
        const headers = bypassHeaders(url);
        const site = await (siteCache.get(key) ?? Promise.resolve(null)).catch(() => null);
        const { links } = await devices.measure();
        return crawl(`${key}/`, { headers, seeds: [url, ...(site?.sitemap?.urls ?? []), ...links], limit: 60 });
      })();
      crawlCache.set(key, job);
      job.catch(() => crawlCache.delete(key));
    }
    return crawlCache.get(key);
  });
  ipcMain.on('window:control', (_e, action: string) => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
  });

  win.on('maximize', () => emit({ type: 'window', maximized: true }));
  win.on('unmaximize', () => emit({ type: 'window', maximized: false }));
  win.on('close', () => settings.flush());

  // App shortcuts also work when the focus is in the UI itself.
  win.webContents.on('before-input-event', (event, input) => {
    const action = shortcutFor(input);
    if (action) {
      event.preventDefault();
      emit({ type: 'shortcut', action });
    } else if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
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
