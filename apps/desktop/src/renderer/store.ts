import { create } from 'zustand';
import type { ChatAttachment, ChatState, GitHubState, ClaudeProjectState, AnalyzeReport, CrawledPage, DevicePreset, EnvId, InitState, McpActivity, McpInfo, ParakeetApi, PhoneState, Project, Settings, ShareReport, UpdateState, VercelState, VercelTeamProject } from '../shared/types';
import { activeProject, closeProject as closeTab, openProject, patchProject, projectFromUrl } from '../shared/projects';
import { envOf, envTargets, urlOnEnv, type ProjectVercel } from './lib/env';
import { activeIds, allPresets } from '../shared/devices';

declare global {
  interface Window {
    parakeet: ParakeetApi;
  }
}
export const api = (): ParakeetApi => window.parakeet;

/** "Error invoking remote method 'x': Error: why" → "why". */
export const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');

export type Section = 'apercu' | 'partage' | 'comparer' | 'deploiements' | 'checks' | 'reglages' | 'projets';
/** Panel opened next to the devices from the left bar. */
export type Panel = 'page' | 'checks' | 'claude';
export type SettingsTab = 'general' | 'devices' | 'project' | 'vercel' | 'github' | 'claude' | 'mcp' | 'updates';
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

interface State {
  ready: boolean;
  presets: DevicePreset[];
  settings: Settings;
  platform: InitState['platform'] | null;
  url: string | null;
  detectedFrom: string | null;
  status: LoadStatus;
  error: string | null;
  /** Last analysis of the current page (share tags + 30 checks). */
  report: AnalyzeReport | null;
  share: ShareReport | null;
  shareError: string | null;
  analyzing: boolean;
  pages: CrawledPage[];
  crawling: boolean;
  crawledOrigin: string | null;
  section: Section;
  panel: Panel | null;
  /** Console drawer under the devices. */
  consoleOpen: boolean;
  settingsTab: SettingsTab;
  /** Conversation with Claude, per project id. */
  chats: Record<string, ChatState>;
  /** Message being written in the Claude panel, per project id. */
  drafts: Record<string, { text: string; attachments: ChatAttachment[] }>;
  /** "Show Claude": the next click on a device points at a spot. */
  pointing: boolean;
  github: GitHubState | null;
  maximized: boolean;
  /** Device snapshots shown while native views are hidden under a menu. */
  frozen: Record<string, string> | null;
  paletteOpen: boolean;
  urlFocusTick: number;
  mcp: McpInfo | null;
  vercel: VercelState | null;
  phone: PhoneState | null;
  update: UpdateState | null;
  phoneOpen: boolean;
  /** Preview deployment chosen in the environment switch (null: latest). */
  previewId: string | null;
  /** Older production deployment chosen in the environment switch (null: the live one). */
  prodId: string | null;

  init(): Promise<void>;
  navigate(url: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  analyze(url: string, opts?: { refreshSite?: boolean }): Promise<void>;
  crawlSite(force?: boolean): Promise<void>;
  loadMcp(): Promise<void>;
  /** Show the current page on another environment. */
  switchEnv(env: EnvId, deploymentId?: string | null): Promise<void>;
  /** Tabs */
  switcherOpen: boolean;
  /** Claude Code activity per project id. */
  claude: Record<string, ClaudeProjectState>;
  /** Console and network log of the devices (since each one's last page load). */
  logs: import('../shared/types').DeviceLog[];
  /** Load time and weight of the page, per device. */
  perf: Record<string, import('../shared/types').DevicePerf>;
  /** Device shown in the console tab (null: all). */
  consoleDevice: string | null;
  /** Last capture of each project (overview cards). */
  thumbs: Record<string, string>;
  claudeHooks: import('../shared/types').ClaudeHookState | null;
  selectProject(id: string): Promise<void>;
  closeProject(id: string): Promise<void>;
  openVercelProject(vp: VercelTeamProject): Promise<void>;
  openAddress(url: string): Promise<void>;
  pushMcpActivity(a: McpActivity): void;
  setSection(s: Section): void;
  /** Open the settings on one of their pages. */
  openSettings(tab: SettingsTab): void;
  /** Open or close a panel next to the devices (opens the devices if needed). */
  togglePanel(p: Panel): void;
  toggleConsole(open?: boolean): void;
  /** Open the Claude panel with a message (and things joined to it) ready to send. */
  askClaude(text: string, attachments?: ChatAttachment[]): void;
  setDraft(projectId: string, draft: { text: string; attachments: ChatAttachment[] }): void;
  startPointing(): Promise<void>;
  stopPointing(): void;
  /** Freeze native views as images while a menu or dialog covers the stage. */
  openOverlay(): Promise<void>;
  closeOverlay(): void;
}

let shareSeq = 0;
let initStarted = false;
let overlays = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  presets: [],
  settings: { projects: [], openIds: [], activeId: null, recentUrls: [], active: [], scrollSync: true, landscape: false, throttle: { network: 'off', cpu: 1 }, language: 'en', startup: 'restore', defaultSection: 'apercu', autoAnalyze: true, customDevices: [], deviceOrder: [], devicesPerProject: false, media: { colorScheme: 'auto', reducedMotion: false, moreContrast: false }, onboarded: true, claudePanel: true, claudeAllowCommands: false },
  platform: null,
  url: null,
  detectedFrom: null,
  status: 'idle',
  error: null,
  report: null,
  share: null,
  shareError: null,
  analyzing: false,
  pages: [],
  crawling: false,
  crawledOrigin: null,
  section: 'apercu',
  panel: null,
  consoleOpen: false,
  settingsTab: 'general',
  chats: {},
  drafts: {},
  pointing: false,
  github: null,
  maximized: false,
  frozen: null,
  paletteOpen: false,
  urlFocusTick: 0,
  mcp: null,
  vercel: null,
  switcherOpen: false,
  claude: {},
  thumbs: {},
  logs: [],
  perf: {},
  consoleDevice: null,
  claudeHooks: null,
  phone: null,
  update: null,
  phoneOpen: false,
  previewId: null,
  prodId: null,

  async init() {
    if (initStarted) return; // React StrictMode runs effects twice in dev
    initStarted = true;
    const s = await api().init();
    const section: Section = s.settings.startup === 'projects' && s.settings.projects.length ? 'projets' : s.settings.defaultSection;
    set({ ready: true, presets: s.presets, settings: s.settings, platform: s.platform, url: s.url, detectedFrom: s.detectedFrom, status: s.url ? 'loading' : 'idle', section });
    api().setPreviewsVisible(section === 'apercu');
  },

  async navigate(url) {
    set({ url, status: 'loading', error: null, detectedFrom: null });
    // Remember the project's local dev server, to come back to it from preview or prod.
    const s = get();
    const project = activeProject(s.settings);
    if (project && envOf(url, projectVercel(s)) === 'local' && project.localOrigin !== new URL(url).origin) {
      await s.updateSettings(patchProject(s.settings, project.id, { localOrigin: new URL(url).origin }));
    }
    await api().navigate(url);
    const settings = await api().updateSettings({});
    set({ settings });
  },

  async updateSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
    const settings = await api().updateSettings(patch);
    set({ settings });
  },

  async analyze(url, opts) {
    const seq = ++shareSeq;
    set({ analyzing: true });
    try {
      const report = await api().analyze(url, opts);
      if (seq === shareSeq) set({ report, share: report.share, shareError: null, analyzing: false });
    } catch (e) {
      // Do not leave the previous page's report (and score) on screen.
      if (seq === shareSeq) set({ shareError: cleanError(e), report: null, share: null, analyzing: false });
    }
  },

  async crawlSite(force) {
    const { url, crawling, crawledOrigin } = get();
    if (!url || crawling) return;
    let originNow: string;
    try {
      originNow = new URL(url).origin;
    } catch {
      return;
    }
    if (!force && crawledOrigin === originNow) return;
    set({ crawling: true, crawledOrigin: originNow, ...(crawledOrigin !== originNow ? { pages: [] } : {}) });
    try {
      const pages = await api().crawl(url, { force });
      if (get().crawledOrigin === originNow) set({ pages });
    } catch {
      /* keep the previous list */
    } finally {
      set({ crawling: false });
    }
  },

  async loadMcp() {
    set({ mcp: await api().mcpInfo() });
  },

  async selectProject(id) {
    const s = get();
    if (s.settings.activeId === id && s.settings.openIds.includes(id)) return;
    const project = s.settings.projects.find((p) => p.id === id);
    if (!project) return;
    await s.updateSettings(openProject(s.settings, project));
    // Per-page state belongs to the previous project.
    set({ report: null, share: null, shareError: null, pages: [], crawledOrigin: null, previewId: null, prodId: null, section: s.section === 'projets' ? s.settings.defaultSection : s.section });
    api().setPreviewsVisible(get().section === 'apercu');
    const target = project.lastUrl ?? project.localOrigin ?? projectVercel(get()).project?.productionUrl ?? null;
    if (target) await get().navigate(target);
    else set({ url: null, status: 'idle' });
  },

  async closeProject(id) {
    const s = get();
    const wasActive = s.settings.activeId === id;
    await s.updateSettings(closeTab(s.settings, id));
    const next = get().settings.activeId;
    if (wasActive && next) {
      // selectProject returns early when the id is already active: navigate directly.
      const project = get().settings.projects.find((p) => p.id === next)!;
      set({ report: null, share: null, pages: [], crawledOrigin: null, previewId: null, prodId: null });
      const target = project.lastUrl ?? project.localOrigin ?? projectVercel(get()).project?.productionUrl ?? null;
      if (target) await get().navigate(target);
    }
    if (!get().settings.openIds.length) set({ url: null, status: 'idle', report: null, share: null });
  },

  async openVercelProject(vp) {
    const s = get();
    const existing = s.settings.projects.find((p) => p.vercelProjectId === vp.id);
    const project: Project = existing ?? { id: vp.id, name: vp.name, vercelProjectId: vp.id, teamId: vp.teamId, localOrigin: null, folder: null, lastUrl: null };
    await s.updateSettings({ projects: existing ? s.settings.projects : [...s.settings.projects, project] });
    await get().selectProject(project.id);
  },

  async openAddress(url) {
    const s = get();
    const origin = new URL(url).origin;
    const existing = s.settings.projects.find((p) => p.localOrigin === origin || p.id === `local:${origin}`);
    const project = existing ?? projectFromUrl(url);
    await s.updateSettings({ projects: existing ? s.settings.projects : [...s.settings.projects, { ...project, lastUrl: url }] });
    await get().selectProject(project.id);
    if (existing) await get().navigate(url);
  },

  async switchEnv(env, deploymentId) {
    if (env === 'preview' && deploymentId !== undefined) set({ previewId: deploymentId });
    if (env === 'prod') set({ prodId: deploymentId ?? null });
    const s = get();
    const target = urlOnEnv(s.url, env, envTargets(activeProject(s.settings)?.localOrigin ?? null, projectVercel(s), s.previewId, s.prodId));
    if (target) await get().navigate(target);
  },

  pushMcpActivity(a) {
    const mcp = get().mcp;
    if (mcp) set({ mcp: { ...mcp, activity: [a, ...mcp.activity].slice(0, 100) } });
    else void get().loadMcp();
  },

  setSection(section) {
    set({ section });
    api().setPreviewsVisible(section === 'apercu');
  },

  openSettings(settingsTab) {
    set({ settingsTab });
    get().setSection('reglages');
  },

  togglePanel(p) {
    const s = get();
    if (s.section !== 'apercu') {
      s.setSection('apercu');
      set({ panel: p });
    } else set({ panel: s.panel === p ? null : p });
    // Without automatic analysis, opening a panel reads the page.
    const after = get();
    if (after.panel && after.panel !== 'claude' && !after.report && !after.analyzing && after.url && after.status === 'loaded') void after.analyze(after.url);
  },

  askClaude(text, attachments = []) {
    const s = get();
    const id = s.settings.activeId;
    if (!id) return;
    const prev = s.drafts[id] ?? { text: '', attachments: [] };
    set({ drafts: { ...s.drafts, [id]: { text: !text ? prev.text : prev.text ? `${prev.text}\n${text}` : text, attachments: [...prev.attachments, ...attachments] } } });
    if (s.section !== 'apercu') s.setSection('apercu');
    set({ panel: 'claude' });
  },

  setDraft(projectId, draft) {
    set({ drafts: { ...get().drafts, [projectId]: draft } });
  },

  async startPointing() {
    const s = get();
    if (s.pointing) return;
    if (s.section !== 'apercu') s.setSection('apercu');
    await s.openOverlay();
    set({ pointing: true });
  },

  stopPointing() {
    if (!get().pointing) return;
    set({ pointing: false });
    get().closeOverlay();
  },

  toggleConsole(open) {
    const s = get();
    if (s.section !== 'apercu') {
      s.setSection('apercu');
      set({ consoleOpen: true });
    } else set({ consoleOpen: open ?? !s.consoleOpen });
  },

  async openOverlay() {
    overlays++;
    if (overlays === 1) set({ frozen: await api().freeze() });
  },

  closeOverlay() {
    overlays = Math.max(0, overlays - 1);
    if (overlays === 0) {
      api().unfreeze();
      set({ frozen: null });
    }
  },
}));

/** Built-in and custom devices, in the order chosen in the settings. */
export const devicePresets = (s: Pick<State, 'presets' | 'settings'>) => allPresets(s.presets, s.settings);

/** Devices shown side by side (global list, or the active project's). */
export const activePresets = (s: Pick<State, 'presets' | 'settings'>) => {
  const all = devicePresets(s);
  return activeIds(s.presets, s.settings)
    .map((id) => all.find((p) => p.id === id))
    .filter((p): p is DevicePreset => !!p);
};

/** The Vercel project and deployments of a project (default: the active tab). */
export function projectVercel(s: Pick<State, 'settings' | 'vercel'>, projectId?: string): ProjectVercel {
  const project = projectId ? s.settings.projects.find((p) => p.id === projectId) : activeProject(s.settings);
  const vp = project?.vercelProjectId ? (s.vercel?.projects.find((p) => p.id === project.vercelProjectId) ?? null) : null;
  return { project: vp, deployments: vp ? (s.vercel?.deployments[vp.id] ?? []) : [] };
}

export const currentProject = (s: Pick<State, 'settings'>) => activeProject(s.settings);
