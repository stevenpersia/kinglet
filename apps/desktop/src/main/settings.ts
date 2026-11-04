import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import type { Settings } from '../shared/types';
import { DEFAULT_ACTIVE, PRESETS } from './presets';

const DEFAULTS: Settings = { url: null, localOrigin: null, recentUrls: [], active: DEFAULT_ACTIVE, scrollSync: true, landscape: false };

/** Small JSON file in the user data folder (~/.config/Parakeet on Linux). */
export class SettingsStore {
  private file = join(app.getPath('userData'), 'settings.json');
  private timer: NodeJS.Timeout | null = null;
  value: Settings;

  constructor() {
    let stored: Partial<Settings> = {};
    try {
      stored = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      /* first run or unreadable: defaults */
    }
    const known = new Set(PRESETS.map((p) => p.id));
    const active = (stored.active ?? DEFAULTS.active).filter((id) => known.has(id));
    this.value = { ...DEFAULTS, ...stored, active: active.length ? active : DEFAULTS.active };
  }

  update(patch: Partial<Settings>): Settings {
    this.value = { ...this.value, ...patch };
    if (patch.url) this.value.recentUrls = [patch.url, ...this.value.recentUrls.filter((u) => u !== patch.url)].slice(0, 8);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    return this.value;
  }

  flush() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.value, null, 2));
  }
}
