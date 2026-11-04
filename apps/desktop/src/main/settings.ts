import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { migrateSettings } from '../shared/projects';
import type { Settings } from '../shared/types';
import { DEFAULT_ACTIVE, PRESETS } from './presets';

export const DEFAULTS: Settings = {
  projects: [],
  openIds: [],
  activeId: null,
  recentUrls: [],
  active: DEFAULT_ACTIVE,
  scrollSync: true,
  landscape: false,
  throttle: { network: 'off', cpu: 1 },
  language: 'system',
  startup: 'restore',
  defaultSection: 'apercu',
  autoAnalyze: true,
  customDevices: [],
  deviceOrder: [],
  devicesPerProject: false,
  onboarded: false,
  claudePanel: true,
  claudeAllowCommands: false,
};

/** Small JSON file in the user data folder (~/.config/Parakeet on Linux). */
export class SettingsStore {
  private file = join(app.getPath('userData'), 'settings.json');
  private timer: NodeJS.Timeout | null = null;
  value: Settings;

  constructor() {
    let stored: Partial<Settings> = {};
    try {
      // Settings from before multi-project support had a single site: migrated into a project.
      stored = migrateSettings(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch {
      /* first run or unreadable: defaults */
    }
    const known = new Set([...PRESETS.map((p) => p.id), ...(stored.customDevices ?? []).map((d) => d.id)]);
    const active = (stored.active ?? DEFAULTS.active).filter((id) => known.has(id));
    // People who used Parakeet before the first-run window don't need it.
    const onboarded = stored.onboarded ?? (stored.projects?.length ?? 0) > 0;
    this.value = { ...DEFAULTS, ...stored, onboarded, active: active.length ? active : DEFAULTS.active };
  }

  update(patch: Partial<Settings>): Settings {
    this.value = { ...this.value, ...patch };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    return this.value;
  }

  flush() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.value, null, 2));
  }
}
