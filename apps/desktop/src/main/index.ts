import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } from 'electron';
import { resolveLanguage, setLanguage, t, locale, buildShareFix, checkShare, crawl, probeImage, readPageMeta, readSharePreviews, readSiteFiles, runChecks, score, vercelBypassHeaders, auditSite, readHreflang, readStructuredData, evaluateBudgets, describeFailures, type AxeViolation, type BudgetMeasure, type CrawledPage, type HreflangReport, type SiteFiles } from '@kinglet/core';
import { startStdio } from '@kinglet/mcp';
import QRCode from 'qrcode';
import type { AnalyzeReport, CompareColumn, DeviceSlot, EnvId, ExportShot, FeedbackPin, HistoryEntry, InitState, McpActivity, McpInfo, NewProjectRequest, Project, PhoneQr, PhoneState, PreviewEvent, Settings, ShareStudio } from '../shared/types';
import { HistoryStore } from './history';
import { ReviewServer } from './review';
import { startControlServer } from './control';
import { mcpLaunch } from './mcp-launch';
import { activeProject, isLocalUrl, openProject, patchProject, projectForFolder, projectFromUrl, visit } from '../shared/projects';
import { VercelService } from './vercel';
import { defaultRoots, findVercelFolder, vercelLinkOf } from './folders';
import { cloneRepo, pushToGitHub } from './clone';
import { createProject, frameworkOf, githubRepoOf, slugify } from './scaffold';
import { DevServers } from './devserver';
import { ClaudeTracker, type HookPayload } from './claude';
import { ClaudeHooks } from './claude-hooks';
import { lanAddresses, LanProxy } from './lan';
import { Updater } from './updater';
import { detectLocalServer, detectLocalServers } from './detect';
import { claudeCli, findClaude } from './claude-cli';
import { Terminals } from './terminal';
import { GitHubService } from './github';
import { execFile } from 'node:child_process';
import { readChanges } from './changes';
import { DeviceManager, shortcutFor } from './devices';
import { PRESETS } from './presets';
import { activeIds, allPresets, setActiveIds } from '../shared/devices';
import { runSelftest } from './selftest';
import { SettingsStore } from './settings';
import { moveOldUserData, oldHookScript } from './rename';

/** `kinglet --mcp`: run as the MCP server Claude Code launches (stdio, no window). */
const MCP_MODE = process.argv.includes('--mcp');

app.setName('Kinglet');
// Same folder in dev and packaged: ~/.config/Kinglet (the MCP bridge looks there).
// Kinglet was called Parakeet: its folder (~/.config/Parakeet) moves over on first launch.
if (!MCP_MODE && !process.env.KINGLET_SELFTEST) moveOldUserData(app.getPath('appData'));
app.setPath('userData', join(app.getPath('appData'), 'Kinglet'));
// The acceptance run must not read or write the user's real settings.
if (process.env.KINGLET_SELFTEST) {
  app.setPath('userData', join(process.env.KINGLET_SELFTEST, 'userdata'));
  // …nor the user's Claude Code settings (hooks).
  process.env.CLAUDE_CONFIG_DIR = join(process.env.KINGLET_SELFTEST, 'claude');
}
// Linux: let Chromium pick Wayland when the session is Wayland, X11 otherwise.
// The MCP server needs no display: it is launched with --ozone-platform=headless (too late
// to set from here, Chromium picks its platform before this script runs) and no GPU.
if (MCP_MODE) app.disableHardwareAcceleration();
else app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

/**
 * Vercel Deployment Protection bypass ("Protection Bypass for Automation" secret):
 * from KINGLET_VERCEL_BYPASS, else from the linked Vercel project.
 */
let projectBypass: (url: string) => string | null = () => null;
const bypassSecret = (url: string) => process.env.KINGLET_VERCEL_BYPASS || projectBypass(url) || '';
const BYPASS_HOSTS = (process.env.KINGLET_BYPASS_HOSTS ?? '*.vercel.app').split(',').map((h) => h.trim()).filter(Boolean);

/** Bots (tag reading, checks, compare): the secret only. Devices (real browsers) also get the cookie header. */
const bypassHeaders = (url: string, browser = false) => vercelBypassHeaders(url, { secret: bypassSecret(url), hosts: BYPASS_HOSTS, browser });

async function createWindow() {
  const settings = new SettingsStore();
  const applyLanguage = () => setLanguage(resolveLanguage(settings.value.language, app.getLocale()));
  applyLanguage();
  // Frameless window with our own title bar: no default menu (it would also steal Ctrl+R).
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0A0A0B',
    title: 'Kinglet',
    icon: join(__dirname, '../../build/icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/ui.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });

  // "On my phone": proxy to the local dev server, created on demand. Paired phones follow local navigation.
  let lanAddress: string | null = null;
  const lan = new LanProxy(
    () => activeProject(settings.value)?.localOrigin ?? null,
    (clients) => {
      lanClients = clients;
      emit({ type: 'phone', state: phoneState() });
    },
  );
  const phoneState = (): PhoneState => {
    const addresses = lanAddresses();
    const address = addresses.find((a) => a.address === lanAddress)?.address ?? addresses[0]?.address ?? null;
    return { running: lan.running, port: lan.port, addresses, address, follow: lan.follow, clients: lanClients };
  };
  let lanClients: PhoneState['clients'] = [];
  app.on('will-quit', () => lan.stop());

  const emit = (e: PreviewEvent) => {
    if (e.type === 'favicon') return void saveFavicon(e.url, e.pageUrl);
    const localOrigin = activeProject(settings.value)?.localOrigin;
    if ((e.type === 'loaded' || e.type === 'navigated') && localOrigin && e.url.startsWith(localOrigin)) {
      const u = new URL(e.url);
      lan.notify(u.pathname + u.search);
    }
    if (!win.isDestroyed()) win.webContents.send('app:event', e);
  };
  /** Set once the history is ready: measure the local site after a finished Claude task. */
  let onClaudeDone: (projectId: string, prompt: string | null) => void = () => undefined;
  const devices = new DeviceManager(win, allPresets(PRESETS, settings.value), emit);
  /** Devices shown: the global list or the active project's, built-in and custom. */
  const applyDevices = () => {
    devices.setPresets(allPresets(PRESETS, settings.value));
    devices.setActive(activeIds(PRESETS, settings.value));
  };
  devices.setThrottle(settings.value.throttle);
  devices.setMedia(settings.value.media);
  devices.setOffline(settings.value.offline);
  devices.setMocks(settings.value.mocks);
  devices.setScrollSync(settings.value.scrollSync);
  devices.setRegion(settings.value.region, settings.value.regionPerDevice);
  devices.setText(settings.value.textSize);
  devices.setKeyboard(settings.value.keyboard);
  /** The site's favicon, kept on the project for its tab (also when closed). */
  async function saveFavicon(url: string, pageUrl: string) {
    const project = activeProject(settings.value);
    const origin = (u: string | null | undefined) => {
      try {
        return u ? new URL(u).origin : null;
      } catch {
        return null;
      }
    };
    // The devices may still show the previous project's page right after a tab switch.
    if (!project || origin(pageUrl) !== origin(project.lastUrl)) return;
    let data: string | null = null;
    try {
      if (url.startsWith('data:image/')) data = url;
      else if (/^https?:/.test(url)) {
        const res = await devices.session.fetch(url);
        const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && type.startsWith('image/') && buf.length <= 256 * 1024) data = `data:${type};base64,${buf.toString('base64')}`;
      }
    } catch {
      return; // offline, server stopped: keep the previous one
    }
    if (!data || data.length > 400_000 || project.favicon === data || activeProject(settings.value)?.id !== project.id) return;
    settings.update(patchProject(settings.value, project.id, { favicon: data }));
    emit({ type: 'settings', settings: settings.value });
  }
  devices.setLandscape(settings.value.landscape);

  /** System notification, unless the user is already looking at that project. */
  const notify = (projectId: string | null, title: string, body: string) => {
    if (win.isFocused() && activeProject(settings.value)?.id === projectId) return;
    if (!Notification.isSupported() || process.env.KINGLET_SELFTEST) return;
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      win.show();
      win.focus();
      if (projectId) emit({ type: 'shortcut', action: `tab-${settings.value.openIds.indexOf(projectId) + 1}` });
    });
    n.show();
  };
  /** Latest deployment state per Vercel project, to notice a build that just failed. */
  const lastBuild = new Map<string, string>();
  const vercel = new VercelService(app.getPath('userData'), (state) => {
    emit({ type: 'vercel', state });
    for (const [vpId, list] of Object.entries(state.deployments)) {
      const d = list[0];
      if (!d) continue;
      const key = `${d.id}:${d.state}`;
      const before = lastBuild.get(vpId);
      lastBuild.set(vpId, key);
      if (before && before !== key && d.state === 'ERROR') {
        const project = settings.value.projects.find((p) => p.vercelProjectId === vpId);
        notify(project?.id ?? null, t(`Build failed · ${project?.name ?? 'Vercel'}`, `Build en erreur · ${project?.name ?? 'Vercel'}`), `${d.branch ?? ''} ${d.commitMessage ?? ''}`.trim());
      }
      // A build just went live: measure it (history) and check the budgets.
      if (before && before !== key && d.state === 'READY') {
        const project = settings.value.projects.find((p) => p.vercelProjectId === vpId);
        if (project) void measureDeployment(project.id, { url: d.url, deploymentId: d.id, production: d.production, branch: d.branch, commit: d.commitMessage }, true, 'vercel').catch((e) => console.error('history', e));
      }
    }
  });
  projectBypass = (url) => vercel.bypassSecretFor(url);
  /** Vercel projects whose folder we already looked for (once per run). */
  const searchedFolders = new Set<string>();
  /** Follow the deployments of the Vercel projects open in tabs, and find their folders on disk. */
  const watchOpenProjects = () => {
    const open = settings.value.openIds.map((id) => settings.value.projects.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p?.vercelProjectId);
    vercel.setWatched(open.map((p) => ({ projectId: p.vercelProjectId!, teamId: p.teamId })));
    for (const p of open.filter((x) => !x.folder && !searchedFolders.has(x.id))) {
      searchedFolders.add(p.id);
      setTimeout(() => {
        const folder = findVercelFolder(p.vercelProjectId!);
        if (!folder) return;
        settings.update(patchProject(settings.value, p.id, { folder }));
        emit({ type: 'settings', settings: settings.value });
      }, 50);
    }
  };
  void vercel.restore().then(() => {
    // Before multi-project support, one Vercel project was linked to the (single) site.
    const legacy = vercel.legacyLink();
    const active = activeProject(settings.value);
    if (legacy && active && !settings.value.projects.some((p) => p.vercelProjectId === legacy.projectId)) {
      const vp = vercel.state.projects.find((p) => p.id === legacy.projectId);
      settings.update(patchProject(settings.value, active.id, { vercelProjectId: legacy.projectId, teamId: legacy.teamId, name: vp?.name ?? active.name }));
      emit({ type: 'settings', settings: settings.value });
    }
    watchOpenProjects();
  });
  app.on('will-quit', () => vercel.stop());

  devices.session.webRequest.onBeforeSendHeaders((details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, ...bypassHeaders(details.url, true) } });
  });

  /** Open (or reuse) the project of a URL in a tab, active. */
  const openUrlProject = (url: string) => {
    const origin = new URL(url).origin;
    const existing = settings.value.projects.find((p) => p.localOrigin === origin || p.id === `local:${origin}`);
    settings.update(openProject(settings.value, existing ?? projectFromUrl(url)));
  };

  ipcMain.handle('app:init', async (): Promise<InitState> => {
    let url: string | null = null;
    let detectedFrom: string | null = null;
    const active = activeProject(settings.value);
    if (process.env.KINGLET_URL) {
      url = process.env.KINGLET_URL;
      detectedFrom = 'KINGLET_URL';
      openUrlProject(url);
    } else if (active?.lastUrl) {
      url = active.lastUrl;
      detectedFrom = t('last session', 'dernière session');
    } else {
      url = await detectLocalServer();
      if (url) {
        detectedFrom = t('detected', 'détecté');
        openUrlProject(url);
      }
    }
    applyDevices();
    watchOpenProjects();
    if (url) void navigate(url);
    return {
      presets: PRESETS,
      settings: settings.value,
      url,
      detectedFrom,
      platform: {
        sessionType: process.env.XDG_SESSION_TYPE ?? t('unknown', 'inconnu'),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        version: app.getVersion(),
        isDev: !app.isPackaged,
      },
    };
  });
  /**
   * Navigate every device. The local dev server found at startup is remembered here; afterwards
   * the UI (which knows the Vercel deployments) decides what is local.
   */
  const navigate = (url: string) => {
    settings.update(visit(settings.value, url));
    const active = activeProject(settings.value);
    if (active && !active.localOrigin && isLocalUrl(url)) settings.update(patchProject(settings.value, active.id, { localOrigin: new URL(url).origin }));
    return devices.navigate(url);
  };
  ipcMain.handle('preview:navigate', (_e, url: string) => navigate(url));
  ipcMain.handle('preview:reload', () => devices.reload());
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const next = settings.update(patch);
    if (patch.language) applyLanguage();
    // New devices load the current page; existing ones keep theirs.
    if (patch.active || patch.listed || patch.customDevices || patch.deviceOrder || patch.devicesPerProject !== undefined || patch.activeId !== undefined || patch.projects) applyDevices();
    if (patch.scrollSync !== undefined) devices.setScrollSync(patch.scrollSync);
    if (patch.landscape !== undefined) devices.setLandscape(patch.landscape);
    if (patch.throttle) devices.setThrottle(patch.throttle);
    if (patch.media) devices.setMedia(patch.media);
    if (patch.offline !== undefined) devices.setOffline(patch.offline);
    if (patch.mocks) devices.setMocks(patch.mocks);
    if (patch.region || patch.regionPerDevice) devices.setRegion(next.region, next.regionPerDevice);
    if (patch.textSize) devices.setText(patch.textSize);
    if (patch.keyboard !== undefined) devices.setKeyboard(patch.keyboard);
    if (patch.reviewPublicUrl !== undefined) emit({ type: 'review', state: review.state() });
    if (patch.openIds || patch.projects) watchOpenProjects();
    emit({ type: 'settings', settings: next });
    return next;
  });
  ipcMain.handle('projects:changes', (_e, projectId: string) => {
    const folder = settings.value.projects.find((p) => p.id === projectId)?.folder;
    return folder ? readChanges(folder) : null;
  });
  ipcMain.handle('projects:pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, { title: t('Project folder', 'Dossier du projet'), properties: ['openDirectory'], defaultPath: activeProject(settings.value)?.folder ?? app.getPath('home') });
    const folder = r.canceled ? null : (r.filePaths[0] ?? null);
    return folder ? { folder, vercelProjectId: vercelLinkOf(folder)?.projectId ?? null } : null;
  });
  ipcMain.on('preview:layout', (_e, slots: DeviceSlot[]) => devices.setLayout(slots));
  ipcMain.on('preview:visible', (_e, visible: boolean) => devices.setVisible(visible));
  ipcMain.handle('preview:freeze', () => devices.freeze());
  ipcMain.handle('preview:thumbnail', () => devices.thumbnail());
  ipcMain.handle('preview:logs', () => devices.allLogs());
  ipcMain.on('preview:unfreeze', () => devices.unfreeze());
  ipcMain.on('preview:devtools', (_e, id: string) => devices.openDevtools(id));
  // Site-wide files and crawl results are cached per origin (they rarely change while you work on a page).
  const siteCache = new Map<string, Promise<SiteFiles>>();
  const crawlCache = new Map<string, Promise<CrawledPage[]>>();
  const origin = (u: string) => new URL(u).origin;

  /** Alternates of a page (hreflang return links), kept a minute: they don't change while you work. */
  const hreflangCache = new Map<string, { at: number; job: Promise<HreflangReport | null> }>();
  const hreflangOf = (meta: Awaited<ReturnType<typeof readPageMeta>>, refresh = false) => {
    if (!meta.hreflang.length) return Promise.resolve(null);
    const hit = hreflangCache.get(meta.finalUrl);
    if (!refresh && hit && Date.now() - hit.at < 60_000) return hit.job;
    const job = readHreflang(meta, { headers: bypassHeaders(meta.finalUrl) }).catch(() => null);
    hreflangCache.set(meta.finalUrl, { at: Date.now(), job });
    return job;
  };

  /** What each device measured on the current page, for the budgets. */
  const budgetMeasures = (vitals: Record<string, { lcpMs: number | null; cls: number | null }>): BudgetMeasure[] =>
    devices.perfs().map((p) => ({ deviceId: p.deviceId, label: p.label, bytes: p.bytes, requests: p.requests, lcpMs: vitals[p.deviceId]?.lcpMs ?? null, cls: vitals[p.deviceId]?.cls ?? null }));

  async function analyzePage(url: string, opts: { refreshSite?: boolean } = {}): Promise<AnalyzeReport> {
    const headers = bypassHeaders(url);
    const [meta, rendered] = await Promise.all([readPageMeta(url, { headers }), devices.measure()]);
    const [image, hreflang] = await Promise.all([meta.ogImageUrl ? probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : Promise.resolve(null), hreflangOf(meta, opts.refreshSite)]);
    const key = origin(meta.finalUrl);
    if (opts.refreshSite || !siteCache.has(key)) siteCache.set(key, readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }));
    const site = await siteCache.get(key)!.catch(() => null);
    const checks = runChecks({ meta, image, site, rendered: rendered.devices, hreflang });
    const vitals = Object.fromEntries(rendered.devices.filter((r) => r.vitals).map((r) => [r.id, r.vitals!]));
    // Accessibility: violations merged across devices, focus from the worst device.
    const byRule = new Map<string, AxeViolation>();
    for (const r of rendered.devices)
      for (const v of r.axe?.violations ?? []) {
        const had = byRule.get(v.id);
        byRule.set(v.id, had ? { ...had, nodes: Math.max(had.nodes, v.nodes), targets: [...new Set([...had.targets, ...v.targets])].slice(0, 5), devices: [...new Set([...had.devices, ...v.devices])] } : v);
      }
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
    const focus = rendered.devices.filter((r) => r.focusMissing).sort((a, b) => b.focusMissing!.count - a.focusMissing!.count)[0]?.focusMissing ?? null;
    const a11y = rendered.devices.some((r) => r.axe || r.focusMissing) ? { violations: [...byRule.values()].sort((a, b) => order[a.impact] - order[b.impact] || b.nodes - a.nodes), focus } : null;
    const project = activeProject(settings.value);
    const budgets = project?.budgets?.length ? evaluateBudgets(project.budgets, new URL(meta.finalUrl).pathname, budgetMeasures(vitals)) : [];
    return { url, share: { meta, image, issues: checkShare(meta, image) }, site, checks, score: score(checks), vitals, a11y, structured: readStructuredData(meta.jsonLd, meta.jsonLdErrors, locale()), hreflang, budgets };
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
  ipcMain.handle('site:audit', async (_e, url: string, opts: { limit?: number }) => {
    const key = origin(url);
    const headers = bypassHeaders(url);
    if (!siteCache.has(key)) {
      const meta = await readPageMeta(url, { headers }).catch(() => null);
      if (meta) siteCache.set(key, readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }));
    }
    const site = await (siteCache.get(key) ?? Promise.resolve(null)).catch(() => null);
    const { links } = await devices.measure({ a11y: false });
    let last = 0;
    const audit = await auditSite(`${key}/`, {
      headers,
      site,
      seeds: [url, ...links],
      limit: opts.limit ?? 80,
      onProgress: (done, queued) => {
        if (Date.now() - last < 150 && done < queued) return;
        last = Date.now();
        emit({ type: 'audit', done, queued });
      },
    });
    // Dead anchors: the raw HTML misses ids added by JavaScript. Look again in each rendered page.
    const anchors = audit.brokenLinks.filter((b) => b.kind === 'anchor');
    if (anchors.length) {
      const pages = [...new Set(anchors.map((b) => b.url.split('#')[0]!))].slice(0, 15);
      const ids = new Map<string, string[] | null>();
      for (let i = 0; i < pages.length; i += 3) await Promise.all(pages.slice(i, i + 3).map(async (p) => ids.set(p, await devices.renderedIds(p))));
      audit.brokenLinks = audit.brokenLinks.filter((b) => {
        if (b.kind !== 'anchor') return true;
        const [page, frag = ''] = b.url.split('#');
        const found = ids.get(page!);
        return !found || !found.includes(decodeURIComponent(frag));
      });
      audit.anchorsRendered = pages.every((p) => ids.get(p) != null);
    }
    return audit;
  });
  ipcMain.on('preview:taborder', (_e, on: boolean) => devices.setTabOrder(on));
  ipcMain.handle('preview:fill-forms', (_e, mode: 'valid' | 'invalid' | 'clear') => devices.fillForms(mode));

  // Export: captures of the devices, as a sheet (PNG), a PDF, a folder of images, or a video.
  const exportDir = () => {
    for (const k of ['pictures', 'downloads', 'home'] as const) {
      try {
        const p = app.getPath(k);
        if (existsSync(p)) return p;
      } catch {
        /* unknown on this system */
      }
    }
    return app.getPath('home');
  };
  const FILTERS: Record<string, Electron.FileFilter> = { png: { name: 'PNG', extensions: ['png'] }, pdf: { name: 'PDF', extensions: ['pdf'] }, webm: { name: 'WebM', extensions: ['webm'] }, gif: { name: 'GIF', extensions: ['gif'] } };
  const askSave = async (name: string, kind: string) => {
    // The acceptance run saves without asking (no one to answer the dialog).
    if (process.env.KINGLET_SELFTEST) return join(process.env.KINGLET_SELFTEST, `export-${name}`);
    const r = await dialog.showSaveDialog(win, { title: t('Export', 'Exporter'), defaultPath: join(exportDir(), name), filters: [FILTERS[kind]!] });
    return r.canceled || !r.filePath ? null : r.filePath;
  };
  ipcMain.handle('export:shots', async (_e, full: boolean) => {
    const shots: ExportShot[] = [];
    for (const d of devices.entries()) {
      const shot = await devices.shot(d.preset.id, full);
      if (shot) shots.push(shot);
    }
    return shots;
  });
  ipcMain.handle('export:frames', () => devices.frames());
  ipcMain.on('export:scroll', (_e, ratio: number) => devices.scrollAll(Math.min(1, Math.max(0, Number(ratio) || 0))));
  ipcMain.handle('export:save', async (_e, data: Uint8Array, name: string, kind: string) => {
    const file = await askSave(name, kind);
    if (file) writeFileSync(file, Buffer.from(data));
    return file;
  });
  ipcMain.handle('export:folder', async (_e, shots: ExportShot[]) => {
    const r = await dialog.showOpenDialog(win, { title: t('Folder for the captures', 'Dossier des captures'), defaultPath: exportDir(), properties: ['openDirectory', 'createDirectory'] });
    const dir = r.canceled ? null : (r.filePaths[0] ?? null);
    if (!dir) return null;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    for (const sh of shots) writeFileSync(join(dir, `${stamp}-${sh.id}.png`), Buffer.from(sh.dataUrl.split(',')[1] ?? '', 'base64'));
    return dir;
  });
  ipcMain.handle('export:pdf', async (_e, shots: ExportShot[], title: string, name: string) => {
    const file = await askSave(`${String(name || 'kinglet').replace(/[^\w.-]+/g, '-')}.pdf`, 'pdf');
    if (!file) return null;
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const date = new Date().toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:14mm}body{margin:0;font:11px system-ui,sans-serif;color:#18181b}
section{page-break-after:always;display:flex;flex-direction:column;align-items:center;gap:8px}section:last-child{page-break-after:auto}
header{width:100%;display:flex;justify-content:space-between;color:#71717a;border-bottom:1px solid #e4e4e7;padding-bottom:6px;margin-bottom:6px}
h1{font-size:13px;margin:0;color:#18181b}img{max-width:100%;max-height:250mm;border:1px solid #e4e4e7;border-radius:6px}</style></head><body>
${shots.map((sh) => `<section><header><h1>${esc(title)}</h1><span>${esc(sh.label)} · ${sh.width}×${sh.height}${sh.cut ? ` · ${esc(t('cut', 'coupée'))}` : ''} · ${esc(date)}</span></header><img src="${sh.dataUrl}"></section>`).join('\n')}
</body></html>`;
    const tmp = join(app.getPath('userData'), 'tmp');
    mkdirSync(tmp, { recursive: true });
    const page = join(tmp, 'export.html');
    writeFileSync(page, html);
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await pdfWin.loadFile(page);
      writeFileSync(file, await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }));
    } finally {
      pdfWin.destroy();
    }
    return file;
  });

  // History: score, Web Vitals and weight of each deployment, measured off screen like a phone.
  const history = new HistoryStore(join(app.getPath('userData'), 'history'));
  ipcMain.handle('history:load', (_e, projectId: string) => history.load(projectId));
  const historyDevice = () => {
    const phone = devices.entries().find((d) => d.preset.kind === 'phone')?.preset.id;
    return phone ?? PRESETS.find((p) => p.kind === 'phone')?.id ?? PRESETS[0]!.id;
  };
  async function measureDeployment(
    projectId: string,
    target: { url: string; deploymentId: string | null; production: boolean; branch: string | null; commit: string | null },
    auto = false,
    source: HistoryEntry['source'] = 'manual',
  ): Promise<HistoryEntry> {
    lastMeasure.set(projectId, Date.now());
    const project = settings.value.projects.find((p) => p.id === projectId);
    const device = historyDevice();
    const label = PRESETS.find((p) => p.id === device)?.label ?? device;
    const root = new URL(target.url);
    const at = Date.now();
    const snap = await devices.snapshot(root.toString(), device);
    let checksScore: HistoryEntry['score'] = null;
    try {
      const meta = await readPageMeta(root.toString(), { headers: bypassHeaders(root.toString()) });
      checksScore = score(runChecks({ meta, image: null, site: null, rendered: snap.measured ? [snap.measured] : [] }));
    } catch {
      /* unreachable: the snapshot says why */
    }
    const measure = (perf: typeof snap.perf, vitals: typeof snap.vitals): BudgetMeasure => ({ deviceId: device, label, bytes: perf?.bytes ?? null, requests: perf?.requests ?? null, lcpMs: vitals?.lcpMs ?? null, cls: vitals?.cls ?? null });
    const budgets = project?.budgets ?? [];
    const failures = describeFailures(evaluateBudgets(budgets, root.pathname, [measure(snap.perf, snap.vitals)]));
    // Budgets on other pages: measured too (a few, exact paths only).
    for (const path of [...new Set(budgets.map((b) => b.path.trim()).filter((p) => p.startsWith('/') && !p.includes('*') && p !== root.pathname))].slice(0, 3)) {
      const other = await devices.snapshot(new URL(path, root).toString(), device);
      failures.push(...describeFailures(evaluateBudgets(budgets, path, [measure(other.perf, other.vitals)])));
    }
    const entry: HistoryEntry = { at, ...target, source, device: label, score: checksScore, lcpMs: snap.vitals?.lcpMs ?? null, cls: snap.vitals?.cls ?? null, bytes: snap.perf?.bytes ?? null, requests: snap.perf?.requests ?? null, budgetFailures: failures, error: snap.error };
    const entries = history.add(projectId, entry);
    emit({ type: 'history', projectId, entries });
    if (failures.length && auto) notify(projectId, t(`Budget exceeded · ${project?.name ?? ''}`, `Budget dépassé · ${project?.name ?? ''}`), failures.slice(0, 3).join('\n'));
    return entry;
  }
  /**
   * Without Vercel too: the local site is measured after each commit in the project's folder and
   * each finished Claude task (once a minute at most), when the project's dev server answers.
   */
  const lastMeasure = new Map<string, number>();
  const git = (folder: string, args: string[]) =>
    new Promise<string | null>((resolve) => execFile('git', ['-C', folder, ...args], { timeout: 5000 }, (err, out) => resolve(err ? null : out.trim())));
  const localPage = (projectId: string) => {
    const p = settings.value.projects.find((x) => x.id === projectId);
    if (!p || p.historyAuto === false) return null;
    if (p.lastUrl && isLocalUrl(p.lastUrl)) return p.lastUrl;
    return p.localOrigin ? `${p.localOrigin}/` : null;
  };
  const measureLocal = async (projectId: string, source: 'commit' | 'claude', commit: string | null) => {
    const url = localPage(projectId);
    if (!url || Date.now() - (lastMeasure.get(projectId) ?? 0) < 60_000) return;
    const answers = await fetch(url, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);
    if (!answers) return; // dev server stopped: nothing to measure
    const folder = settings.value.projects.find((x) => x.id === projectId)?.folder;
    const branch = folder ? await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD']) : null;
    await measureDeployment(projectId, { url, deploymentId: null, production: false, branch, commit }, true, source).catch((e) => console.error('history', e));
  };
  const heads = new Map<string, string>();
  const watchCommits = setInterval(async () => {
    for (const id of settings.value.openIds) {
      const folder = settings.value.projects.find((p) => p.id === id)?.folder;
      if (!folder || !localPage(id)) continue;
      const line = await git(folder, ['log', '-1', '--format=%H%x1f%s']);
      if (!line) continue;
      const [sha, subject] = line.split('\x1f');
      const before = heads.get(id);
      heads.set(id, sha!);
      if (before && before !== sha) void measureLocal(id, 'commit', subject ?? null);
    }
  }, 20_000);
  app.on('will-quit', () => clearInterval(watchCommits));
  onClaudeDone = (projectId, prompt) => void measureLocal(projectId, 'claude', prompt);

  ipcMain.handle('history:measure', (_e, projectId: string, target: Parameters<typeof measureDeployment>[1] | null) => {
    const url = target?.url ?? devices.currentUrl;
    if (!url) throw new Error(t('No page shown.', 'Aucune page affichée.'));
    return measureDeployment(projectId, target ?? { url, deploymentId: null, production: false, branch: null, commit: null });
  });

  // Review link: the client answers and pins comments from a browser, into the Feedback panel.
  const readPins = (projectId: string): FeedbackPin[] => {
    try {
      return JSON.parse(readFileSync(feedbackFile(projectId), 'utf8'));
    } catch {
      return [];
    }
  };
  const writePins = (projectId: string, pins: FeedbackPin[]) => {
    mkdirSync(join(app.getPath('userData'), 'feedback'), { recursive: true });
    writeFileSync(feedbackFile(projectId), JSON.stringify(pins));
  };
  const review = new ReviewServer({
    dir: join(app.getPath('userData'), 'review'),
    loadPins: readPins,
    savePins: (projectId, pins) => {
      writePins(projectId, pins);
      emit({ type: 'feedback', projectId, pins });
      const project = settings.value.projects.find((p) => p.id === projectId);
      notify(projectId, t(`New feedback · ${project?.name ?? ''}`, `Nouveau retour · ${project?.name ?? ''}`), t('A client answered on the review link.', 'Un client a répondu sur le lien de relecture.'));
    },
    publicUrl: () => settings.value.reviewPublicUrl,
    onChange: (state) => emit({ type: 'review', state }),
  });
  app.on('will-quit', () => review.stop());
  ipcMain.handle('review:state', () => review.state());
  ipcMain.handle('review:close', (_e, projectId: string) => review.close(projectId));
  ipcMain.handle('review:open', async (_e, projectId: string) => {
    const project = settings.value.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(t('Unknown project.', 'Projet inconnu.'));
    const shots = [];
    for (const d of devices.entries()) {
      const data = await devices.capture(d.preset.id, Math.min(1, 2 / d.preset.dpr));
      if (data) shots.push({ id: d.preset.id, label: d.preset.label, ...devices.viewport(d.preset), jpeg: Buffer.from(data, 'base64') });
    }
    return review.open(projectId, project.name, devices.currentUrl ?? project.lastUrl ?? '', shots);
  });

  // Claude Code activity, through hooks (opt-in, see claude-hooks.ts).
  const claudeHooks = new ClaudeHooks(app.getPath('userData'));
  if (!process.env.KINGLET_SELFTEST) claudeHooks.repoint(oldHookScript(app.getPath('appData')));
  const tracker = new ClaudeTracker();
  const emitClaude = () => emit({ type: 'claude', projects: tracker.projects });
  const expireTimer = setInterval(() => tracker.expire() && emitClaude(), 60_000);
  app.on('will-quit', () => {
    clearInterval(expireTimer);
    claudeHooks.unpublish();
  });
  const onClaudeEvent = (payload: HookPayload) => {
    const project = payload.cwd ? projectForFolder(settings.value.projects, payload.cwd) : null;
    const r = tracker.ingest(payload, project);
    if (!r) return;
    emitClaude();
    if (r.finished && project) {
      const st = tracker.projects[project.id]!;
      if (r.event.kind !== 'error') onClaudeDone(project.id, st.prompt);
      const n = st.files.length;
      notify(
        project.id,
        t(`Claude is done · ${project.name}`, `Claude a terminé · ${project.name}`),
        r.event.kind === 'error' ? (st.lastAction ?? '') : n ? t(`${n} file${n > 1 ? 's' : ''} changed`, `${n} fichier${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}`) : (st.prompt ?? ''),
      );
    } else if (r.event.kind === 'waiting' && project) notify(project.id, t(`Claude is waiting for your reply · ${project.name}`, `Claude attend ta réponse · ${project.name}`), r.event.text ?? '');
  };
  ipcMain.handle('claude:state', () => ({ hooks: claudeHooks.state(), projects: tracker.projects }));
  ipcMain.handle('claude:install', () => claudeHooks.install());
  ipcMain.handle('claude:uninstall', () => claudeHooks.uninstall());
  ipcMain.on('claude:seen', (_e, projectId: string) => tracker.markSeen(projectId) && emitClaude());

  // MCP: control server for Claude Code (through packages/mcp), and the activity it generates.
  const activity: McpActivity[] = [];
  const control = startControlServer({
    devices,
    version: app.getVersion(),
    userData: app.getPath('userData'),
    analyze: (url) => analyzePage(url),
    navigate: async (url) => {
      await navigate(url);
      await new Promise((r) => setTimeout(r, 500)); // late scripts, console errors
    },
    setActive: (ids) => {
      const known = allPresets(PRESETS, settings.value).filter((p) => ids.includes(p.id)).map((p) => p.id);
      if (!known.length) throw new Error(t(`unknown devices: ${ids.join(', ')}`, `appareils inconnus : ${ids.join(', ')}`));
      const next = settings.update(setActiveIds(PRESETS, settings.value, known));
      applyDevices();
      emit({ type: 'settings', settings: next });
    },
    deployments: () => {
      const id = activeProject(settings.value)?.vercelProjectId;
      return { project: vercel.state.projects.find((p) => p.id === id) ?? null, deployments: id ? (vercel.state.deployments[id] ?? []) : [] };
    },
    logs: () => ({ url: devices.currentUrl, throttle: devices.throttling, logs: devices.allLogs() }),
    onClaudeEvent: (payload) => onClaudeEvent(payload as HookPayload),
    onListen: (port, token) => claudeHooks.publish(port, token),
    onActivity: (a) => {
      activity.unshift(a);
      activity.length = Math.min(activity.length, 100);
      emit({ type: 'mcp', activity: a });
    },
  });
  app.on('will-quit', () => control.close());

  // Claude inside Kinglet: the user's own `claude` in a real terminal, in the project folder,
  // with this app's MCP server attached (config file per project, so the command line stays short).
  const terminals = new Terminals(
    (e) => emit({ type: 'term', ...e }),
    (projectId) => {
      const project = settings.value.projects.find((p) => p.id === projectId);
      const bin = findClaude();
      if (!project?.folder || !bin) return null;
      const { exe, args } = mcpLaunch();
      const mcpFile = join(app.getPath('userData'), 'claude-mcp', `${projectId.replace(/[^\w.-]+/g, '_')}.json`);
      mkdirSync(dirname(mcpFile), { recursive: true });
      writeFileSync(mcpFile, JSON.stringify({ mcpServers: { kinglet: { command: exe, args: [...args, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])], env: { KINGLET_CONFIG_DIR: app.getPath('userData') } } } }, null, 2));
      const env = Object.fromEntries(Object.entries({ ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', ELECTRON_RUN_AS_NODE: undefined }).filter((x): x is [string, string] => typeof x[1] === 'string'));
      return { file: bin, args: ['--mcp-config', mcpFile], cwd: project.folder, env };
    },
  );
  app.on('will-quit', () => terminals.killAll());
  ipcMain.handle('chat:cli', () => claudeCli());
  ipcMain.handle('term:start', (_e, projectId: string, cols: number, rows: number) => terminals.start(projectId, cols, rows));
  ipcMain.handle('term:restart', (_e, projectId: string, cols: number, rows: number) => terminals.restart(projectId, cols, rows));
  ipcMain.on('term:input', (_e, projectId: string, data: string) => terminals.input(projectId, data));
  ipcMain.on('term:resize', (_e, projectId: string, cols: number, rows: number) => terminals.resize(projectId, cols, rows));
  ipcMain.handle('term:paste', (_e, projectId: string, text: string, attachments: import('../shared/types').ChatAttachment[]) => terminals.paste(projectId, text, attachments));
  ipcMain.handle('chat:install-mcp', () => {
    const bin = findClaude();
    if (!bin) return { ok: false, output: t('Claude Code isn’t installed.', 'Claude Code n’est pas installé.') };
    const { exe, args } = mcpLaunch();
    return new Promise((resolve) =>
      execFile(bin, ['mcp', 'add', '--scope', 'user', 'kinglet', '--', exe, ...args], { timeout: 20_000 }, (err, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        resolve({ ok: !err || /already exists/i.test(output), output });
      }),
    );
  });

  // First run: local servers and their folders, GitHub.
  ipcMain.handle('detect:servers', () => detectLocalServers());
  ipcMain.handle('projects:find-folder', (_e, vercelProjectId: string) => findVercelFolder(vercelProjectId));
  ipcMain.on('preview:inspect', (_e, on: boolean) => devices.setInspect(on));
  ipcMain.handle('preview:element-at', (_e, id: string, x: number, y: number) => devices.elementAt(id, x, y));

  const github = new GitHubService(app.getPath('userData'), (state) => emit({ type: 'github', state }));
  void github.restore();
  ipcMain.handle('github:state', () => github.state);
  ipcMain.handle('github:connect', (_e, token: string) => github.connect(token));
  ipcMain.handle('github:disconnect', () => github.disconnect());
  // Clone the project's repository: ask where, then git clone (null when the dialog is cancelled).
  ipcMain.handle('projects:clone', async (_e, gitUrl: string) => {
    if (!/^https:\/\/[\w.-]+\/[\w./-]+\.git$/.test(gitUrl)) throw new Error(t('Not a repository URL.', 'Ce n’est pas l’adresse d’un dépôt.'));
    const home = app.getPath('home');
    const r = await dialog.showOpenDialog(win, {
      title: t('Where to put the code', 'Où mettre le code'),
      buttonLabel: t('Clone here', 'Cloner ici'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultRoots(home).find((d) => d !== home && existsSync(d)) ?? home,
    });
    const parent = r.canceled ? null : (r.filePaths[0] ?? null);
    return parent ? { folder: await cloneRepo(gitUrl, parent, github.cloneToken()) } : null;
  });
  ipcMain.handle('github:issue', (_e, repo: string, title: string, body: string) => github.createIssue(repo, title, body));
  ipcMain.handle('github:owners', () => github.owners());

  // A new project from scratch: an empty folder for Claude, the dev server, then GitHub and Vercel.
  const projectOf = (id: string) => {
    const p = settings.value.projects.find((x) => x.id === id);
    if (!p) throw new Error(t('Unknown project.', 'Projet inconnu.'));
    return p;
  };
  const devServers = new DevServers((projectId, state) => {
    // The server answers on another port than planned (it was taken): follow it.
    const p = settings.value.projects.find((x) => x.id === projectId);
    if (state.status === 'running' && state.url && p && p.localOrigin !== new URL(state.url).origin) {
      settings.update(patchProject(settings.value, projectId, { localOrigin: new URL(state.url).origin }));
      emit({ type: 'settings', settings: settings.value });
    }
    emit({ type: 'dev', projectId, state });
  });
  app.on('will-quit', () => devServers.stopAll());
  const newProjectsHome = () => {
    const home = app.getPath('home');
    return defaultRoots(home).find((d) => d !== home && existsSync(d)) ?? join(home, 'dev');
  };
  ipcMain.handle('projects:default-parent', () => newProjectsHome());
  ipcMain.handle('projects:pick-parent', async (_e, current: string | null) => {
    const r = await dialog.showOpenDialog(win, { title: t('Where to create the project', 'Où créer le projet'), buttonLabel: t('Create here', 'Créer ici'), properties: ['openDirectory', 'createDirectory'], defaultPath: current ?? newProjectsHome() });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.handle('projects:create', async (_e, req: NewProjectRequest): Promise<Project> => {
    const name = req.name.trim();
    if (!name) throw new Error(t('Give the project a name.', 'Donne un nom au projet.'));
    mkdirSync(req.parent, { recursive: true });
    const folder = await createProject({ name, parent: req.parent });
    // No address yet: the dev server Claude sets up gives it (localOrigin follows its first answer).
    const project: Project = { id: `new:${folder}`, name, vercelProjectId: null, teamId: null, localOrigin: null, folder, lastUrl: null, githubRepo: null };
    settings.update({ projects: [...settings.value.projects.filter((p) => p.id !== project.id), project] });
    emit({ type: 'settings', settings: settings.value });
    return project;
  });
  ipcMain.handle('projects:publish-github', async (_e, projectId: string, opts: { name: string; owner: string | null; private: boolean }) => {
    const project = projectOf(projectId);
    if (!project.folder) throw new Error(t('Choose the project folder first.', 'Choisis d’abord le dossier du projet.'));
    const repo = await github.createRepo({ name: slugify(opts.name), owner: opts.owner, private: opts.private, description: t(`${project.name}, created with Kinglet`, `${project.name}, créé avec Kinglet`) });
    await pushToGitHub(project.folder, repo.cloneUrl, github.cloneToken());
    settings.update(patchProject(settings.value, projectId, { githubRepo: repo.fullName }));
    emit({ type: 'settings', settings: settings.value });
    return { fullName: repo.fullName, htmlUrl: repo.htmlUrl };
  });
  ipcMain.handle('projects:publish-vercel', async (_e, projectId: string, opts: { name: string; teamId: string | null }) => {
    const project = projectOf(projectId);
    const repo = project.githubRepo ?? (project.folder ? githubRepoOf(await git(project.folder, ['remote', 'get-url', 'origin'])) : null);
    if (!repo) throw new Error(t('Publish the project on GitHub first: Vercel deploys from its repository.', 'Publie d’abord le projet sur GitHub : Vercel déploie depuis son dépôt.'));
    if (!github.state.connected) throw new Error(t('Connect GitHub in Kinglet (Settings → GitHub).', 'Connecte GitHub dans Kinglet (Réglages → GitHub).'));
    const repoId = await github.repoId(repo);
    const ref = (project.folder ? await git(project.folder, ['rev-parse', '--abbrev-ref', 'HEAD']) : null) || 'main';
    const framework = project.folder ? frameworkOf(project.folder) : null;
    const { project: vp, deployment, deployError } = await vercel.createFromGitHub({ teamId: opts.teamId, name: slugify(opts.name), framework, repo, repoId, ref, folder: project.folder });
    settings.update(patchProject(settings.value, projectId, { vercelProjectId: vp.id, teamId: opts.teamId, githubRepo: repo }));
    emit({ type: 'settings', settings: settings.value });
    watchOpenProjects();
    return { projectId: vp.id, teamId: opts.teamId, url: vp.productionUrl, deploymentUrl: deployment?.url ?? null, inspectorUrl: deployment?.inspectorUrl ?? null, deployError };
  });
  ipcMain.handle('dev:all', () => devServers.all());
  ipcMain.handle('dev:can-start', (_e, projectId: string) => {
    const folder = settings.value.projects.find((p) => p.id === projectId)?.folder;
    if (!folder) return false;
    try {
      return typeof JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).scripts?.dev === 'string';
    } catch {
      return false;
    }
  });
  ipcMain.handle('dev:start', (_e, projectId: string) => {
    const project = projectOf(projectId);
    if (!project.folder) throw new Error(t('Choose the project folder first.', 'Choisis d’abord le dossier du projet.'));
    return devServers.start(projectId, project.folder, project.localOrigin ? `${project.localOrigin}/` : null);
  });
  ipcMain.handle('dev:stop', (_e, projectId: string) => devServers.stop(projectId));
  // Review pins, one file per project (captures included).
  const feedbackFile = (projectId: string) => join(app.getPath('userData'), 'feedback', `${projectId.replace(/[^\w.-]+/g, '_')}.json`);
  ipcMain.handle('feedback:load', (_e, projectId: string) => {
    try {
      return JSON.parse(readFileSync(feedbackFile(projectId), 'utf8'));
    } catch {
      return [];
    }
  });
  ipcMain.handle('feedback:save', (_e, projectId: string, pins: unknown[]) => {
    mkdirSync(join(app.getPath('userData'), 'feedback'), { recursive: true });
    writeFileSync(feedbackFile(projectId), JSON.stringify(pins));
  });
  ipcMain.handle('github:prs', (_e, repo: string, branches: string[]) => github.pullRequests(repo, branches));

  ipcMain.handle('mcp:info', (): McpInfo => {
    const { exe, args } = mcpLaunch();
    const launch = [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    return { command: `claude mcp add --scope user kinglet -- ${launch}`, launch, activity };
  });

  // Vercel
  const vercelCall = (fn: () => Promise<unknown> | void) => async () => {
    await fn();
    return vercel.state;
  };
  ipcMain.handle('vercel:state', () => vercel.state);
  ipcMain.handle('vercel:connect', (_e, token: string) => vercelCall(() => vercel.connect(token))());
  ipcMain.handle('vercel:refresh', vercelCall(() => vercel.refresh()));
  ipcMain.handle('vercel:projects', vercelCall(() => vercel.refreshProjects()));
  ipcMain.handle('vercel:bypass', (_e, projectId: string) => vercelCall(() => vercel.generateBypass(projectId))());
  ipcMain.handle('vercel:disconnect', vercelCall(() => vercel.disconnect()));
  ipcMain.on('shell:open', (_e, url: string) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });

  // Updates (GitHub Releases)
  const updater = new Updater((state) => emit({ type: 'update', state }));
  updater.start(process.env.KINGLET_UPDATE_URL ? 1500 : 10_000);
  app.on('will-quit', () => updater.stop());
  ipcMain.handle('update:state', () => updater.state);
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.on('update:install', () => updater.install());

  // On my phone
  ipcMain.handle('phone:state', () => phoneState());
  ipcMain.handle('phone:start', async () => {
    await lan.start();
    return phoneState();
  });
  ipcMain.handle('phone:stop', () => {
    lan.stop();
    return phoneState();
  });
  ipcMain.handle('phone:follow', (_e, on: boolean) => {
    lan.follow = on;
    return phoneState();
  });
  ipcMain.handle('phone:address', (_e, address: string) => {
    lanAddress = address;
    return phoneState();
  });
  ipcMain.handle('phone:qr', async (_e, url: string, local: boolean): Promise<PhoneQr> => {
    let target = url;
    let withSecret = false;
    if (local) {
      const address = phoneState().address;
      if (!lan.running || !address) throw new Error(t('Local network sharing is not turned on.', 'Le partage sur le réseau local n’est pas activé.'));
      const u = new URL(url);
      target = lan.pairUrl(address, u.pathname + u.search);
    } else {
      // Protected preview: Vercel accepts the bypass in the query string (the phone gets a cookie).
      const secret = bypassHeaders(url)['x-vercel-protection-bypass'];
      if (secret) {
        const u = new URL(url);
        u.searchParams.set('x-vercel-protection-bypass', secret);
        u.searchParams.set('x-vercel-set-bypass-cookie', 'true');
        target = u.toString();
        withSecret = true;
      }
    }
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a0a0b', light: '#ffffff' } });
    return { url: target, svg, withSecret };
  });

  // Compare: the same page on each environment, read like a bot (fast, no devices needed).
  const COMPARED: [string, (m: Awaited<ReturnType<typeof readPageMeta>>) => string | null][] = [
    ['title', (m) => m.title],
    ['description', (m) => m.description],
    ['og:title', (m) => m.og['title'] ?? null],
    ['og:description', (m) => m.og['description'] ?? null],
    ['og:site_name', (m) => m.og['site_name'] ?? null],
    ['og:image', (m) => m.ogImageUrl],
    ['twitter:card', (m) => m.twitter['card'] ?? null],
    ['canonical', (m) => m.canonical],
    ['robots', (m) => m.robotsMeta ?? m.robotsHeader],
    ['theme-color', (m) => m.themeColor],
    ['lang', (m) => m.lang],
  ];
  ipcMain.handle('compare:visual', (_e, targets: { env: EnvId; label: string; url: string }[], deviceId: string) =>
    Promise.all(
      targets.map(async (x) => {
        const { image, vitals, error } = await devices.snapshot(x.url, deviceId);
        return { ...x, image, vitals, error };
      }),
    ),
  );
  ipcMain.handle('compare:run', (_e, targets: { env: EnvId; label: string; url: string }[]): Promise<CompareColumn[]> =>
    Promise.all(
      targets.map(async (t) => {
        try {
          const headers = bypassHeaders(t.url);
          const meta = await readPageMeta(t.url, { headers });
          const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : null;
          const values = Object.fromEntries(COMPARED.map(([k, f]) => [k, f(meta)]));
          return { ...t, status: meta.status, error: null, values, score: score(runChecks({ meta, image, site: null })) };
        } catch (e) {
          return { ...t, status: null, error: (e as Error).message, values: {}, score: null };
        }
      }),
    ),
  );

  ipcMain.on('window:control', (_e, action: string) => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
  });

  win.on('maximize', () => emit({ type: 'window', maximized: true }));
  win.on('unmaximize', () => emit({ type: 'window', maximized: false }));
  win.on('close', () => settings.flush());

  // App shortcuts also work when the focus is in the UI itself.
  let inTerminal = false;
  ipcMain.on('term:focus', (_e, on: boolean) => (inTerminal = on));
  win.webContents.on('before-input-event', (event, input) => {
    const action = shortcutFor(input, inTerminal);
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

  if (process.env.KINGLET_SELFTEST) void runSelftest(win, devices, process.env.KINGLET_SELFTEST);
}

if (MCP_MODE) {
  // stdout belongs to the MCP protocol: no window, no app lifecycle.
  void startStdio(app.getVersion()).catch((e) => {
    process.stderr.write(`kinglet --mcp: ${(e as Error).stack}\n`);
    app.exit(1);
  });
  process.stdin.on('end', () => app.exit(0));
} else {
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
