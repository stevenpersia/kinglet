import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moveOldUserData } from './rename';

describe('moving the Parakeet folder', () => {
  it('moves it once, and never over an existing Kinglet folder', () => {
    const appData = mkdtempSync(join(tmpdir(), 'kinglet-appdata-'));
    mkdirSync(join(appData, 'Parakeet'));
    writeFileSync(join(appData, 'Parakeet', 'settings.json'), '{"onboarded":true}');
    expect(moveOldUserData(appData)).toBe(true);
    expect(readFileSync(join(appData, 'Kinglet', 'settings.json'), 'utf8')).toBe('{"onboarded":true}');
    expect(existsSync(join(appData, 'Parakeet'))).toBe(false);
    mkdirSync(join(appData, 'Parakeet'));
    expect(moveOldUserData(appData)).toBe(false);
    expect(existsSync(join(appData, 'Parakeet'))).toBe(true);
  });

  it('does nothing without an old folder', () => {
    expect(moveOldUserData(mkdtempSync(join(tmpdir(), 'kinglet-appdata-')))).toBe(false);
  });
});
