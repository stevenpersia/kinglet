import type { CustomDevice, DevicePreset, Settings } from './types';

export const iosUA = (v = '18_5', ver = '18.5') =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver} Mobile/15E148 Safari/604.1`;
// iPadOS Safari asks for the desktop site by default and announces itself as a Mac (with touch points).
export const IPADOS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
export const androidUA = (model: string) =>
  `Mozilla/5.0 (Linux; Android 15; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36`;

/** A device added in the settings: the rest (user agent, touch, corners) comes from its type. */
export function customPreset(c: CustomDevice): DevicePreset {
  const mobile = c.kind !== 'desktop';
  return {
    id: c.id,
    label: c.label,
    width: c.width,
    height: c.height,
    dpr: c.dpr,
    mobile,
    touch: mobile,
    userAgent: c.kind === 'phone' ? androidUA('Pixel 9') : c.kind === 'tablet' ? IPADOS_UA : '',
    radius: c.kind === 'phone' ? 36 : c.kind === 'tablet' ? 18 : 0,
    kind: c.kind,
    custom: true,
  };
}

/** Built-in and custom devices, in the order chosen in the settings. */
export function allPresets(builtins: DevicePreset[], s: Pick<Settings, 'customDevices' | 'deviceOrder'>): DevicePreset[] {
  const all = [...builtins, ...(s.customDevices ?? []).map(customPreset)];
  const rank = new Map((s.deviceOrder ?? []).map((id, i) => [id, i]));
  return all
    .map((p, i) => ({ p, k: rank.get(p.id) ?? (s.deviceOrder?.length ?? 0) + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
}

/** Devices shown side by side: the project's own list (when enabled), else the global one, in order. */
export function activeIds(builtins: DevicePreset[], s: Settings): string[] {
  const project = s.devicesPerProject ? s.projects.find((p) => p.id === s.activeId) : null;
  const raw = project?.active?.length ? project.active : s.active;
  const ids = allPresets(builtins, s)
    .map((p) => p.id)
    .filter((id) => raw.includes(id));
  return ids.length ? ids : allPresets(builtins, s).slice(0, 1).map((p) => p.id);
}

/** The settings patch that shows these devices (on the project or globally). */
export function setActiveIds(builtins: DevicePreset[], s: Settings, ids: string[]): Partial<Settings> {
  const ordered = allPresets(builtins, s)
    .map((p) => p.id)
    .filter((id) => ids.includes(id));
  if (!ordered.length) return {};
  if (s.devicesPerProject && s.activeId) return { projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, active: ordered } : p)) };
  return { active: ordered };
}
