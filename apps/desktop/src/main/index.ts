import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } from 'electron';
import { resolveLanguage, setLanguage, t, buildShareFix, checkShare, crawl, probeImage, readPageMeta, readSharePreviews, readSiteFiles, runChecks, score, vercelBypassHeaders, type CrawledPage, type SiteFiles } from '@parakeet/core';
import { startStdio } from '@parakeet/mcp';
import QRCode from 'qrcode';
import type { AnalyzeReport, CompareColumn, DeviceSlot, EnvId, InitState, McpActivity, McpInfo, PhoneQr, PhoneState, PreviewEvent, Settings, ShareStudio } from '../shared/types';
import { startControlServer } from './control';
import { mcpLaunch } from './mcp-launch';
import { activeProject, isLocalUrl, openProject, patchProject, projectForFolder, projectFromUrl, visit } from '../shared/projects';
import { VercelService } from './vercel';
import { findVercelFolder, vercelLinkOf } from './folders';
import { ClaudeTracker, type HookPayload } from './claude';
import { ClaudeHooks } from './claude-hooks';
import { lanAddresses, LanProxy } from './lan';
import { Updater } from './updater';
import { detectLocalServer, detectLocalServers } from './detect';
import { ClaudeChat, findClaude } from './claude-chat';
import { GitHubService } from './github';
import { execFile } from 'node:child_process';
import { DeviceManager, shortcutFor } from './devices';
import { PRESETS } from './presets';
import { activeIds, allPresets, setActiveIds } from '../shared/devices';
import { runSelftest } from './selftest';
import { SettingsStore } from './settings';

/** `parakeet --mcp`: run as the MCP server Claude Code launches (stdio, no window). */
const MCP_MODE = process.argv.includes('--mcp');

app.setName('Parakeet');
// Same folder in dev and packaged: ~/.config/Parakeet (the MCP bridge looks there).
app.setPath('userData', join(app.getPath('appData'), 'Parakeet'));
// The acceptance run must not read or write the user's real settings.
if (process.env.PARAKEET_SELFTEST) {
  app.setPath('userData', join(process.env.PARAKEET_SELFTEST, 'userdata'));
  // …nor the user's Claude Code settings (hooks).
  process.env.CLAUDE_CONFIG_DIR = join(process.env.PARAKEET_SELFTEST, 'claude');
}
// Linux: let Chromium pick Wayland when the session is Wayland, X11 otherwise.
// The MCP server needs no display: it is launched with --ozone-platform=headless (too late
// to set from here, Chromium picks its platform before this script runs) and no GPU.
if (MCP_MODE) app.disableHardwareAcceleration();
else app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

/**
 * Vercel Deployment Protection bypass ("Protection Bypass for Automation" secret):
 * from PARAKEET_VERCEL_BYPASS, else from the linked Vercel project.
 */
let projectBypass: (url: string) => string | null = () => null;
const bypassSecret = (url: string) => process.env.PARAKEET_VERCEL_BYPASS || projectBypass(url) || '';
const BYPASS_HOSTS = (process.env.PARAKEET_BYPASS_HOSTS ?? '*.vercel.app').split(',').map((h) => h.trim()).filter(Boolean);

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
    title: 'Parakeet',
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
    if (!Notification.isSupported() || process.env.PARAKEET_SELFTEST) return;
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
    if (process.env.PARAKEET_URL) {
      url = process.env.PARAKEET_URL;
      detectedFrom = 'PARAKEET_URL';
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
    if (patch.active || patch.customDevices || patch.deviceOrder || patch.devicesPerProject !== undefined || patch.activeId !== undefined || patch.projects) applyDevices();
    if (patch.scrollSync !== undefined) devices.setScrollSync(patch.scrollSync);
    if (patch.landscape !== undefined) devices.setLandscape(patch.landscape);
    if (patch.throttle) devices.setThrottle(patch.throttle);
    if (patch.media) devices.setMedia(patch.media);
    if (patch.offline !== undefined) devices.setOffline(patch.offline);
    if (patch.mocks) devices.setMocks(patch.mocks);
    if (patch.openIds || patch.projects) watchOpenProjects();
    emit({ type: 'settings', settings: next });
    return next;
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

  async function analyzePage(url: string, opts: { refreshSite?: boolean } = {}): Promise<AnalyzeReport> {
    const headers = bypassHeaders(url);
    const [meta, rendered] = await Promise.all([readPageMeta(url, { headers }), devices.measure()]);
    const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers: bypassHeaders(meta.ogImageUrl) }) : null;
    const key = origin(meta.finalUrl);
    if (opts.refreshSite || !siteCache.has(key)) siteCache.set(key, readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }));
    const site = await siteCache.get(key)!.catch(() => null);
    const checks = runChecks({ meta, image, site, rendered: rendered.devices });
    const vitals = Object.fromEntries(rendered.devices.filter((r) => r.vitals).map((r) => [r.id, r.vitals!]));
    return { url, share: { meta, image, issues: checkShare(meta, image) }, site, checks, score: score(checks), vitals };
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
  // Claude Code activity, through hooks (opt-in, see claude-hooks.ts).
  const claudeHooks = new ClaudeHooks(app.getPath('userData'));
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
    approve: (req) => chat.approve(req.chat, req.tool, req.input),
    onActivity: (a) => {
      activity.unshift(a);
      activity.length = Math.min(activity.length, 100);
      emit({ type: 'mcp', activity: a });
    },
  });
  app.on('will-quit', () => control.close());

  // Claude inside Parakeet: Claude Code in the project folder, with this app's MCP server.
  const chat = new ClaudeChat(
    (state) => {
      emit({ type: 'chat', state });
      // Keep the session on the project, to resume it here or in a terminal.
      const p = settings.value.projects.find((x) => x.id === state.projectId);
      if (p && state.sessionId && p.claudeSession !== state.sessionId) {
        settings.update(patchProject(settings.value, p.id, { claudeSession: state.sessionId }));
        emit({ type: 'settings', settings: settings.value });
      }
    },
    (projectId) => {
      const { exe, args } = mcpLaunch();
      return { command: exe, args: [...args, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])], env: { PARAKEET_CONFIG_DIR: app.getPath('userData'), PARAKEET_CHAT_PROJECT: projectId } };
    },
  );
  const chatContext = () => {
    const ids = devices.entries().map((d) => `${d.preset.label} (${d.preset.width}×${d.preset.height}, id ${d.preset.id})`);
    return [
      'You are running inside Parakeet, a desktop app that shows the user’s site on several emulated devices side by side.',
      `Page open now: ${devices.currentUrl ?? 'none'}. Devices shown: ${ids.join(', ') || 'none'}.`,
      'The parakeet MCP tools see exactly what the user sees: after changing code, check the result yourself (screenshot, run_checks, get_console) before saying it is done. The dev server reloads the devices on its own.',
      'Images joined to a message are captures of a device; a numbered clay pin marks the spot the user pointed at.',
      `Answer in ${t('English', 'French')}, briefly.`,
    ].join('\n');
  };
  ipcMain.handle('chat:cli', () => chat.cli());
  ipcMain.handle('chat:state', (_e, projectId: string) => chat.state(projectId, settings.value.projects.find((p) => p.id === projectId)?.claudeSession ?? null));
  ipcMain.handle('chat:send', (_e, projectId: string, text: string, attachments: import('../shared/types').ChatAttachment[]) => {
    const project = settings.value.projects.find((p) => p.id === projectId);
    if (!project?.folder) throw new Error(t('Choose the project folder first.', 'Choisis d’abord le dossier du projet.'));
    chat.send({ projectId, folder: project.folder, sessionId: project.claudeSession ?? null, text, attachments, allowCommands: settings.value.claudeAllowCommands, context: chatContext() });
  });
  ipcMain.on('chat:stop', (_e, projectId: string) => chat.stop(projectId));
  ipcMain.on('chat:approve', (_e, projectId: string, id: string, allow: boolean, all: boolean) => chat.answer(projectId, id, allow, all));
  ipcMain.on('chat:clear', (_e, projectId: string) => {
    chat.clear(projectId);
    settings.update(patchProject(settings.value, projectId, { claudeSession: null }));
    emit({ type: 'settings', settings: settings.value });
  });
  ipcMain.handle('chat:install-mcp', () => {
    const bin = findClaude();
    if (!bin) return { ok: false, output: t('Claude Code isn’t installed.', 'Claude Code n’est pas installé.') };
    const { exe, args } = mcpLaunch();
    return new Promise((resolve) =>
      execFile(bin, ['mcp', 'add', '--scope', 'user', 'parakeet', '--', exe, ...args], { timeout: 20_000 }, (err, stdout, stderr) => {
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
  ipcMain.handle('github:issue', (_e, repo: string, title: string, body: string) => github.createIssue(repo, title, body));
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
    return { command: `claude mcp add --scope user parakeet -- ${launch}`, launch, activity };
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
  updater.start(process.env.PARAKEET_UPDATE_URL ? 1500 : 10_000);
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
    Promise.all(targets.map(async (x) => ({ ...x, ...(await devices.snapshot(x.url, deviceId)) }))),
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
