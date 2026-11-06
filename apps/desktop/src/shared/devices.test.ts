import { describe, expect, it } from 'vitest';
import { activeIds, allPresets, customPreset, listedIds, setActiveIds, setListedIds } from './devices';
import type { DevicePreset, Settings } from './types';

const preset = (id: string, kind: DevicePreset['kind'] = 'phone'): DevicePreset => ({ id, label: id, width: 400, height: 800, dpr: 3, mobile: true, touch: true, userAgent: '', radius: 0, kind });
const builtins = [preset('a'), preset('b'), preset('c', 'desktop')];
const base: Settings = {
  projects: [{ id: 'p', name: 'p', vercelProjectId: null, teamId: null, localOrigin: null, folder: null, lastUrl: null }],
  openIds: ['p'],
  activeId: 'p',
  recentUrls: [],
  active: ['a', 'c'],
  scrollSync: true,
  landscape: false,
  throttle: { network: 'off', cpu: 1 },
  language: 'en',
  startup: 'restore',
  defaultSection: 'apercu',
  autoAnalyze: true,
  customDevices: [],
  deviceOrder: [],
  devicesPerProject: false,
  media: { colorScheme: 'auto', reducedMotion: false, moreContrast: false },
  offline: false,
  mocks: [],
  onboarded: true,
  claudePanel: true,
  claudeAllowCommands: false,
  region: { locale: null, timezone: null, geo: null },
  regionPerDevice: {},
  textSize: { scale: 1, zoom: 1 },
  keyboard: false,
  reviewPublicUrl: null,
};

describe('devices', () => {
  it('builds a custom device from its type', () => {
    const tablet = customPreset({ id: 'x', label: 'X', width: 700, height: 1000, dpr: 2, kind: 'tablet' });
    expect(tablet).toMatchObject({ mobile: true, touch: true, custom: true, kind: 'tablet' });
    expect(tablet.userAgent).toContain('Macintosh');
    expect(customPreset({ id: 'y', label: 'Y', width: 1600, height: 900, dpr: 1, kind: 'desktop' })).toMatchObject({ mobile: false, touch: false, userAgent: '' });
  });

  it('follows the chosen order, custom devices included', () => {
    const s = { ...base, customDevices: [{ id: 'x', label: 'X', width: 1, height: 1, dpr: 1, kind: 'phone' as const }], deviceOrder: ['c', 'x'] };
    expect(allPresets(builtins, s).map((p) => p.id)).toEqual(['c', 'x', 'a', 'b']);
    expect(activeIds(builtins, s)).toEqual(['c', 'a']);
  });

  it('remembers the devices shown per project, whatever the list setting', () => {
    const two: Settings = { ...base, projects: [...base.projects, { ...base.projects[0]!, id: 'q', name: 'q' }], openIds: ['p', 'q'] };
    for (const devicesPerProject of [false, true]) {
      const s = { ...two, devicesPerProject };
      const patch = setActiveIds(builtins, s, ['b', 'a']);
      expect(patch.active).toEqual(['a', 'b']);
      expect(patch.projects?.find((p) => p.id === 'p')?.active).toEqual(['a', 'b']);
      expect(patch.projects?.find((p) => p.id === 'q')?.active).toBeUndefined();
      let next = { ...s, ...patch };
      expect(activeIds(builtins, next)).toEqual(['a', 'b']);
      // Project q never chose: it starts from the last choice, then keeps its own.
      next = { ...next, activeId: 'q' };
      expect(activeIds(builtins, next)).toEqual(['a', 'b']);
      next = { ...next, ...setActiveIds(builtins, next, ['c']) };
      expect(activeIds(builtins, next)).toEqual(['c']);
      // Back on p: its devices again.
      expect(activeIds(builtins, { ...next, activeId: 'p' })).toEqual(['a', 'b']);
    }
    expect(activeIds(builtins, base)).toEqual(['a', 'c']);
    expect(setActiveIds(builtins, base, [])).toEqual({});
  });

  it('lists only the ticked devices, without showing them', () => {
    expect(listedIds(builtins, base)).toEqual(['a', 'b', 'c']);
    const patch = setListedIds(builtins, base, ['b', 'a']);
    expect(patch).toEqual({ listed: ['a', 'b'] });
    const s = { ...base, ...patch };
    expect(listedIds(builtins, s)).toEqual(['a', 'b']);
    // Ticking a device does not show it; unticking hides it.
    expect(activeIds(builtins, s)).toEqual(['a']);
    expect(activeIds(builtins, { ...s, listed: ['b'] })).toEqual(['b']);
  });

  it('keeps one device list per project', () => {
    const per = { ...base, devicesPerProject: true, listed: ['a', 'b', 'c'] };
    const patch = setListedIds(builtins, per, ['c']);
    expect(patch.projects?.[0]?.listed).toEqual(['c']);
    expect(patch.listed).toBeUndefined();
    expect(listedIds(builtins, { ...per, ...patch })).toEqual(['c']);
    expect(activeIds(builtins, { ...per, ...patch })).toEqual(['c']);
  });

  it('lists a device shown from elsewhere (Claude, onboarding)', () => {
    const s = { ...base, listed: ['a'] };
    const shownOnP = (patch: Partial<Settings>) => patch.projects?.[0]?.active;
    const sPatch = setActiveIds(builtins, s, ['b']);
    expect(sPatch).toMatchObject({ active: ['b'], listed: ['a', 'b'] });
    expect(shownOnP(sPatch)).toEqual(['b']);
    const basePatch = setActiveIds(builtins, base, ['b']);
    expect(basePatch.active).toEqual(['b']);
    expect(basePatch.listed).toBeUndefined();
    expect(shownOnP(basePatch)).toEqual(['b']);
  });
});
