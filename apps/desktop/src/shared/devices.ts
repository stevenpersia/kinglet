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

const ownList = (s: Settings) => (s.devicesPerProject ? (s.projects.find((p) => p.id === s.activeId) ?? null) : null);

/**
 * Devices listed in the project (the ones ticked in the settings): only these appear in the device bar,
 * the palette… The project's own list (when enabled), else the global one; no list yet means all.
 */
export function listedIds(builtins: DevicePreset[], s: Settings): string[] {
  const project = ownList(s);
  const raw = project?.listed?.length ? project.listed : s.listed?.length ? s.listed : null;
  const all = allPresets(builtins, s).map((p) => p.id);
  const ids = raw ? all.filter((id) => raw.includes(id)) : all;
  return ids.length ? ids : all.slice(0, 1);
}

/** Devices shown side by side, among the listed ones: the project's own list (when enabled), else the global one, in order. */
export function activeIds(builtins: DevicePreset[], s: Settings): string[] {
  const project = ownList(s);
  const raw = project?.active?.length ? project.active : s.active;
  const listed = listedIds(builtins, s);
  const ids = listed.filter((id) => raw.includes(id));
  return ids.length ? ids : listed.slice(0, 1);
}

/** The settings patch that lists these devices (on the project or globally). Shown devices that leave the list are hidden. */
export function setListedIds(builtins: DevicePreset[], s: Settings, ids: string[]): Partial<Settings> {
  const ordered = allPresets(builtins, s)
    .map((p) => p.id)
    .filter((id) => ids.includes(id));
  if (!ordered.length) return {};
  if (s.devicesPerProject && s.activeId) return { projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, listed: ordered } : p)) };
  return { listed: ordered };
}

/** The settings patch that shows these devices (on the project or globally). A device not listed yet joins the list. */
export function setActiveIds(builtins: DevicePreset[], s: Settings, ids: string[]): Partial<Settings> {
  const ordered = allPresets(builtins, s)
    .map((p) => p.id)
    .filter((id) => ids.includes(id));
  if (!ordered.length) return {};
  const listed = listedIds(builtins, s);
  const missing = ordered.filter((id) => !listed.includes(id));
  const explicit = !!(ownList(s)?.listed?.length || s.listed?.length);
  const list = missing.length && explicit ? [...listed, ...missing] : null;
  if (s.devicesPerProject && s.activeId)
    return { projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, active: ordered, ...(list ? { listed: list } : {}) } : p)) };
  return { active: ordered, ...(list ? { listed: list } : {}) };
}
