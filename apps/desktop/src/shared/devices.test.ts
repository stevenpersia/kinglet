import { describe, expect, it } from 'vitest';
import { activeIds, allPresets, customPreset, setActiveIds } from './devices';
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

  it('keeps one list for all projects, or one per project', () => {
    expect(setActiveIds(builtins, base, ['b', 'a'])).toEqual({ active: ['a', 'b'] });
    const per = { ...base, devicesPerProject: true };
    const patch = setActiveIds(builtins, per, ['b']);
    expect(patch.projects?.[0]?.active).toEqual(['b']);
    expect(activeIds(builtins, { ...per, ...patch })).toEqual(['b']);
    // A project without its own list shows the global one.
    expect(activeIds(builtins, per)).toEqual(['a', 'c']);
    expect(setActiveIds(builtins, base, [])).toEqual({});
  });
});
