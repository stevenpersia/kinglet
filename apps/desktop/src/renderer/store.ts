import { create } from 'zustand';
import type { DevicePreset, InitState, ParakeetApi, Settings, ShareReport } from '../shared/types';

declare global {
  interface Window {
    parakeet: ParakeetApi;
  }
}
export const api = (): ParakeetApi => window.parakeet;

export type Section = 'apercu' | 'partage' | 'comparer' | 'deploiements' | 'checks' | 'reglages';
export type InspectorTab = 'page' | 'partage';
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
  share: ShareReport | null;
  shareError: string | null;
  section: Section;
  inspectorTab: InspectorTab;
  maximized: boolean;
  /** Device snapshots shown while native views are hidden under a menu. */
  frozen: Record<string, string> | null;
  paletteOpen: boolean;
  urlFocusTick: number;

  init(): Promise<void>;
  navigate(url: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  refreshShare(url: string): Promise<void>;
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
  settings: { url: null, recentUrls: [], active: [], scrollSync: true, landscape: false },
  platform: null,
  url: null,
  detectedFrom: null,
  status: 'idle',
  error: null,
  share: null,
  shareError: null,
  section: 'apercu',
  inspectorTab: 'page',
  maximized: false,
  frozen: null,
  paletteOpen: false,
  urlFocusTick: 0,

  async init() {
    if (initStarted) return; // React StrictMode runs effects twice in dev
    initStarted = true;
    const s = await api().init();
    set({ ready: true, presets: s.presets, settings: s.settings, platform: s.platform, url: s.url, detectedFrom: s.detectedFrom, status: s.url ? 'loading' : 'idle' });
  },

  async navigate(url) {
    set({ url, status: 'loading', error: null, detectedFrom: null });
    await api().navigate(url);
    const settings = await api().updateSettings({});
    set({ settings });
  },

  async updateSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
    const settings = await api().updateSettings(patch);
    set({ settings });
  },

  async refreshShare(url) {
    const seq = ++shareSeq;
    try {
      const share = await api().readShare(url);
      if (seq === shareSeq) set({ share, shareError: null });
    } catch (e) {
      if (seq === shareSeq) set({ shareError: (e as Error).message });
    }
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
