import type { CheckResult, CrawledPage, ImageProbe, Issue, PageMeta, ShareFix, SharePreviews, SiteFiles } from '@parakeet/core';

export interface DevicePreset {
  id: string;
  label: string;
  /** CSS viewport size, portrait. */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  touch: boolean;
  userAgent: string;
  /** Screen corner radius in CSS px (0 for desktop). */
  radius: number;
  kind: 'phone' | 'tablet' | 'desktop';
}

/** Where a device view must be drawn, in window coordinates (CSS px). */
export interface DeviceSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface Settings {
  url: string | null;
  recentUrls: string[];
  active: string[];
  scrollSync: boolean;
  landscape: boolean;
}

export interface InitState {
  presets: DevicePreset[];
  settings: Settings;
  url: string | null;
  detectedFrom: string | null;
  platform: { sessionType: string; electron: string; chrome: string; version: string; isDev: boolean };
}

export interface ShareReport {
  meta: PageMeta;
  image: ImageProbe | null;
  issues: Issue[];
}

/** Everything known about the current page: share tags, site files, the 24 checks. */
export interface AnalyzeReport {
  url: string;
  share: ShareReport;
  site: SiteFiles | null;
  checks: CheckResult[];
  score: { passed: number; total: number };
}

export type { CheckResult, CrawledPage, ShareFix, SharePreviews };

export interface ShareStudio {
  previews: SharePreviews;
  fix: ShareFix;
}

export type ShortcutAction = 'reload' | 'focus-url' | 'palette' | 'toggle-scroll-sync' | 'toggle-landscape' | 'settings';

export type PreviewEvent =
  | { type: 'loaded'; url: string }
  | { type: 'loading'; url: string }
  | { type: 'failed'; url: string; error: string }
  | { type: 'navigated'; url: string }
  | { type: 'shortcut'; action: ShortcutAction }
  | { type: 'window'; maximized: boolean };

export interface ParakeetApi {
  init(): Promise<InitState>;
  navigate(url: string): Promise<void>;
  reload(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  setLayout(slots: DeviceSlot[]): void;
  /** Hide the native device views (e.g. on another section). */
  setPreviewsVisible(visible: boolean): void;
  /**
   * Native views always draw above the UI. Before showing a menu or a dialog over the stage,
   * freeze: views are captured as images and hidden. Returns one data URL per device id.
   */
  freeze(): Promise<Record<string, string>>;
  unfreeze(): void;
  openDevtools(deviceId: string): void;
  /** Read the page like the bots do, measure it in the devices, run the checks. */
  analyze(url: string, opts?: { refreshSite?: boolean }): Promise<AnalyzeReport>;
  /** Pages of the site (crawl + sitemap + links of the rendered page). Cached per origin. */
  crawl(url: string, opts?: { force?: boolean }): Promise<CrawledPage[]>;
  /** The 7 platform previews (one fetch per bot) and the suggested fix. */
  sharePreviews(url: string): Promise<ShareStudio>;
  copy(text: string): void;
  windowControl(action: 'minimize' | 'maximize' | 'close'): void;
  onEvent(cb: (e: PreviewEvent) => void): () => void;
}
