import type { DevicePreset } from '../../shared/types';

export const BEZEL: Record<DevicePreset['kind'], number> = { phone: 6, tablet: 10, desktop: 8 };
export const LABEL_H = 26;
export const GAP = 44;

export interface Viewport {
  width: number;
  height: number;
}

/** CSS viewport of a device in the given orientation (desktops never rotate). */
export function viewportOf(p: DevicePreset, landscape: boolean): Viewport {
  return landscape && p.kind !== 'desktop' ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/**
 * One scale shared by every device, so their relative sizes stay true:
 * the largest that fits the stage in height (each device) and in width (all side by side).
 * Never upscales, never goes below 15 %.
 */
export function fitScale(devices: { kind: DevicePreset['kind']; viewport: Viewport }[], stageWidth: number, stageHeight: number): number {
  if (!devices.length) return 1;
  const usableH = stageHeight - LABEL_H - 10;
  const bezels = devices.map((d) => BEZEL[d.kind] * 2);
  const byHeight = Math.min(...devices.map((d, i) => (usableH - bezels[i]!) / d.viewport.height));
  const totalW = devices.reduce((a, d) => a + d.viewport.width, 0);
  const byWidth = (stageWidth - GAP * (devices.length - 1) - bezels.reduce((a, b) => a + b, 0)) / totalW;
  return Math.max(0.15, Math.min(1, byHeight, byWidth));
}
