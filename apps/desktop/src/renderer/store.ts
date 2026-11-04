import { create } from 'zustand';
import type { AnalyzeReport, CrawledPage, DevicePreset, EnvId, InitState, McpActivity, McpInfo, ParakeetApi, Settings, ShareReport, VercelState } from '../shared/types';
import { envOf, envTargets, urlOnEnv } from './lib/env';

declare global {
  interface Window {
    parakeet: ParakeetApi;
  }
}
export const api = (): ParakeetApi => window.parakeet;

/** "Error invoking remote method 'x': Error: why" → "why". */
export const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');

export type Section = 'apercu' | 'partage' | 'comparer' | 'deploiements' | 'checks' | 'reglages';
export type InspectorTab = 'page' | 'partage' | 'checks' | 'mcp';
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
  /** Last analysis of the current page (share tags + 24 checks). */
  report: AnalyzeReport | null;
  share: ShareReport | null;
  shareError: string | null;
  analyzing: boolean;
  pages: CrawledPage[];
  crawling: boolean;
  crawledOrigin: string | null;
  section: Section;
  inspectorTab: InspectorTab;
  maximized: boolean;
  /** Device snapshots shown while native views are hidden under a menu. */
  frozen: Record<string, string> | null;
  paletteOpen: boolean;
  urlFocusTick: number;
  mcp: McpInfo | null;
  vercel: VercelState | null;
  /** Preview deployment chosen in the environment switch (null: latest). */
  previewId: string | null;

  init(): Promise<void>;
  navigate(url: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  analyze(url: string, opts?: { refreshSite?: boolean }): Promise<void>;
  crawlSite(force?: boolean): Promise<void>;
  loadMcp(): Promise<void>;
  /** Show the current page on another environment. */
  switchEnv(env: EnvId, previewId?: string): Promise<void>;
  pushMcpActivity(a: McpActivity): void;
  setSection(s: Section): void;
  setInspectorTab(t: InspectorTab): void;
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
  settings: { url: null, localOrigin: null, recentUrls: [], active: [], scrollSync: true, landscape: false },
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
  inspectorTab: 'page',
  maximized: false,
  frozen: null,
  paletteOpen: false,
  urlFocusTick: 0,
  mcp: null,
  vercel: null,
  previewId: null,

  async init() {
    if (initStarted) return; // React StrictMode runs effects twice in dev
    initStarted = true;
    const s = await api().init();
    set({ ready: true, presets: s.presets, settings: s.settings, platform: s.platform, url: s.url, detectedFrom: s.detectedFrom, status: s.url ? 'loading' : 'idle' });
  },

  async navigate(url) {
    set({ url, status: 'loading', error: null, detectedFrom: null });
    // Remember the local dev server, to come back to it from preview or prod.
    if (envOf(url, get().vercel) === 'local') await get().updateSettings({ localOrigin: new URL(url).origin });
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

  async switchEnv(env, previewId) {
    if (previewId !== undefined) set({ previewId });
    const { url, settings, vercel } = get();
    const target = urlOnEnv(url, env, envTargets(settings.localOrigin, vercel, get().previewId));
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

  setInspectorTab(inspectorTab) {
    set({ inspectorTab });
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

export const activePresets = (s: Pick<State, 'presets' | 'settings'>) =>
  s.settings.active.map((id) => s.presets.find((p) => p.id === id)).filter((p): p is DevicePreset => !!p);
