import { describe, expect, it } from 'vitest';
import type { DevicePreset } from '../../shared/types';
import { BEZEL, GAP, LABEL_H, fitScale, viewportOf } from './layout';

const phone = { kind: 'phone' as const, width: 393, height: 852 } as DevicePreset;
const tablet = { kind: 'tablet' as const, width: 820, height: 1180 } as DevicePreset;
const desktop = { kind: 'desktop' as const, width: 1440, height: 900 } as DevicePreset;

describe('viewportOf', () => {
  it('swaps width and height in landscape, except for desktops', () => {
    expect(viewportOf(phone, true)).toEqual({ width: 852, height: 393 });
    expect(viewportOf(phone, false)).toEqual({ width: 393, height: 852 });
    expect(viewportOf(desktop, true)).toEqual({ width: 1440, height: 900 });
  });
});

describe('fitScale', () => {
  const devs = [phone, tablet].map((p) => ({ kind: p.kind, viewport: viewportOf(p, false) }));

  it('is limited by the height of the tallest device', () => {
    const s = fitScale(devs, 5000, 700);
    expect(s).toBeCloseTo((700 - LABEL_H - 10 - BEZEL.tablet * 2) / 1180, 5);
  });

  it('is limited by the total width when devices are side by side', () => {
    const s = fitScale(devs, 600, 5000);
    expect(s).toBeCloseTo((600 - GAP - BEZEL.phone * 2 - BEZEL.tablet * 2) / (393 + 820), 5);
  });

  it('never upscales and never goes below 15 %', () => {
    expect(fitScale(devs, 10_000, 10_000)).toBe(1);
    expect(fitScale(devs, 50, 50)).toBe(0.15);
  });
});
