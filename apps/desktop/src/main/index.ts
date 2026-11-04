import { join } from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from 'electron';
import { buildShareFix, checkShare, crawl, probeImage, readPageMeta, readSharePreviews, readSiteFiles, runChecks, score, type CrawledPage, type SiteFiles } from '@parakeet/core';
import { startStdio } from '@parakeet/mcp';
import type { AnalyzeReport, DeviceSlot, InitState, McpActivity, McpInfo, PreviewEvent, Settings, ShareStudio } from '../shared/types';
import { startControlServer } from './control';
import { mcpLaunch } from './mcp-launch';
import { detectLocalServer } from './detect';
import { DeviceManager, shortcutFor } from './devices';
import { PRESETS } from './presets';
import { runSelftest } from './selftest';
import { SettingsStore } from './settings';

/** `parakeet --mcp`: run as the MCP server Claude Code launches (stdio, no window). */
const MCP_MODE = process.argv.includes('--mcp');

app.setName('Parakeet');
// Same folder in dev and packaged: ~/.config/Parakeet (the MCP bridge looks there).
app.setPath('userData', join(app.getPath('appData'), 'Parakeet'));
// The acceptance run must not read or write the user's real settings.
if (process.env.PARAKEET_SELFTEST) app.setPath('userData', join(process.env.PARAKEET_SELFTEST, 'userdata'));
// Linux: let Chromium pick Wayland when the session is Wayland, X11 otherwise.
// The MCP server needs no display: it is launched with --ozone-platform=headless (too late
// to set from here, Chromium picks its platform before this script runs) and no GPU.
if (MCP_MODE) app.disableHardwareAcceleration();
else app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

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

  async function analyzePage(url: string, opts: { refreshSite?: boolean } = {}): Promise<AnalyzeReport> {
    const headers = bypassHeaders(url);
    const [meta, rendered] = await Promise.all([readPageMeta(url, { headers }), devices.measure()]);
    const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : null;
    const key = origin(meta.finalUrl);
    if (opts.refreshSite || !siteCache.has(key)) siteCache.set(key, readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }));
    const site = await siteCache.get(key)!.catch(() => null);
    const checks = runChecks({ meta, image, site, rendered: rendered.devices });
    return { url, share: { meta, image, issues: checkShare(meta, image) }, site, checks, score: score(checks) };
  }
  ipcMain.handle('page:analyze', (_e, url: string, opts: { refreshSite?: boolean }) => analyzePage(url, opts));

  ipcMain.handle('share:previews', async (_e, url: string): Promise<ShareStudio> => {
    const previews = await readSharePreviews(url, { headers: bypassHeaders(url) });
    return { previews, fix: buildShareFix(previews.meta, previews.image) };
  });
  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text));

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
  // MCP: control server for Claude Code (through packages/mcp), and the activity it generates.
  const activity: McpActivity[] = [];
  const control = startControlServer({
    devices,
    version: app.getVersion(),
    userData: app.getPath('userData'),
    analyze: (url) => analyzePage(url),
    navigate: async (url) => {
      settings.update({ url });
      await devices.navigate(url);
      await new Promise((r) => setTimeout(r, 500)); // late scripts, console errors
    },
    setActive: (ids) => {
      const known = PRESETS.filter((p) => ids.includes(p.id)).map((p) => p.id);
      if (!known.length) throw new Error(`appareils inconnus : ${ids.join(', ')}`);
      const next = settings.update({ active: known });
      devices.setActive(next.active);
      emit({ type: 'settings', settings: next });
    },
    onActivity: (a) => {
      activity.unshift(a);
      activity.length = Math.min(activity.length, 100);
      emit({ type: 'mcp', activity: a });
    },
  });
  app.on('will-quit', () => control.close());

  ipcMain.handle('mcp:info', (): McpInfo => {
    const { exe, args } = mcpLaunch();
    const launch = [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    return { command: `claude mcp add --scope user parakeet -- ${launch}`, launch, activity };
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

if (MCP_MODE) {
  // stdout belongs to the MCP protocol: no window, no app lifecycle.
  void startStdio(app.getVersion()).catch((e) => {
    process.stderr.write(`parakeet --mcp: ${(e as Error).stack}\n`);
    app.exit(1);
  });
  process.stdin.on('end', () => app.exit(0));
} else {
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
