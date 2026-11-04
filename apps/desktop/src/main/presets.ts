import type { DevicePreset } from '../shared/types';
import { androidUA as android, iosUA as ios, IPADOS_UA as IPADOS } from '../shared/devices';

export const PRESETS: DevicePreset[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true, touch: true, userAgent: ios(), radius: 0, kind: 'phone' },
  { id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, dpr: 3, mobile: true, touch: true, userAgent: ios(), radius: 48, kind: 'phone' },
  { id: 'iphone-16-pro-max', label: 'iPhone 16 Pro Max', width: 440, height: 956, dpr: 3, mobile: true, touch: true, userAgent: ios(), radius: 52, kind: 'phone' },
  { id: 'pixel-9', label: 'Pixel 9', width: 412, height: 923, dpr: 2.625, mobile: true, touch: true, userAgent: android('Pixel 9'), radius: 40, kind: 'phone' },
  { id: 'galaxy-s24', label: 'Galaxy S24', width: 384, height: 832, dpr: 3, mobile: true, touch: true, userAgent: android('SM-S921B'), radius: 36, kind: 'phone' },
  { id: 'ipad-mini', label: 'iPad mini', width: 744, height: 1133, dpr: 2, mobile: true, touch: true, userAgent: IPADOS, radius: 20, kind: 'tablet' },
  { id: 'ipad-air', label: 'iPad Air', width: 820, height: 1180, dpr: 2, mobile: true, touch: true, userAgent: IPADOS, radius: 18, kind: 'tablet' },
  { id: 'ipad-pro-13', label: 'iPad Pro 13', width: 1032, height: 1376, dpr: 2, mobile: true, touch: true, userAgent: IPADOS, radius: 18, kind: 'tablet' },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 800, dpr: 2, mobile: false, touch: false, userAgent: '', radius: 0, kind: 'desktop' },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, dpr: 1, mobile: false, touch: false, userAgent: '', radius: 0, kind: 'desktop' },
];

export const DEFAULT_ACTIVE = ['iphone-16', 'ipad-air'];
