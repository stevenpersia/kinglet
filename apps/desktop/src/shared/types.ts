import type { ImageProbe, Issue, PageMeta } from '@parakeet/core';

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

export interface InitState {
  presets: DevicePreset[];
  active: string[];
  url: string | null;
  detectedFrom: string | null;
  platform: { sessionType: string; electron: string; chrome: string };
}

export interface ShareReport {
  meta: PageMeta;
  image: ImageProbe | null;
  issues: Issue[];
}

export type PreviewEvent =
  | { type: 'loaded'; url: string }
  | { type: 'failed'; url: string; error: string }
  | { type: 'navigated'; url: string };

export interface ParakeetApi {
  init(): Promise<InitState>;
  navigate(url: string): Promise<void>;
  reload(): Promise<void>;
  setActive(ids: string[]): Promise<void>;
  setLayout(slots: DeviceSlot[]): void;
  setScrollSync(on: boolean): void;
  readShare(url: string): Promise<ShareReport>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): void;
  onPreview(cb: (e: PreviewEvent) => void): () => void;
}
