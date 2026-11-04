import type { DevicePreset } from '../shared/types';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
// iPadOS Safari asks for the desktop site by default and announces itself as a Mac (with touch points).
const IPADOS_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export const PRESETS: DevicePreset[] = [
  { id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, dpr: 3, mobile: true, touch: true, userAgent: IOS_SAFARI, radius: 48, kind: 'phone' },
  { id: 'pixel-9', label: 'Pixel 9', width: 412, height: 923, dpr: 2.625, mobile: true, touch: true, userAgent: ANDROID_CHROME, radius: 40, kind: 'phone' },
  { id: 'ipad-air', label: 'iPad Air', width: 820, height: 1180, dpr: 2, mobile: true, touch: true, userAgent: IPADOS_SAFARI, radius: 18, kind: 'tablet' },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, dpr: 1, mobile: false, touch: false, userAgent: '', radius: 0, kind: 'desktop' },
];

export const DEFAULT_ACTIVE = ['iphone-16', 'ipad-air'];
