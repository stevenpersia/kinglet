import { describe, expect, it } from 'vitest';
import { shortcutFor } from './devices';

const key = (k: string, mods: { shift?: boolean } = {}) => ({ type: 'keyDown' as const, key: k, control: true, meta: false, shift: !!mods.shift, alt: false });

describe('app shortcuts', () => {
  it('belong to the app outside the terminal', () => {
    expect(shortcutFor(key('r'))).toBe('reload');
    expect(shortcutFor(key('j'))).toBe('claude');
  });

  it('leave Ctrl R, L, K, P, J to the shell and Claude Code in the terminal', () => {
    for (const k of ['r', 'l', 'k', 'p', 'j']) expect(shortcutFor(key(k), true)).toBeNull();
    expect(shortcutFor(key(','), true)).toBe('settings');
    expect(shortcutFor(key('2'), true)).toBe('tab-2');
    expect(shortcutFor(key('a', { shift: true }), true)).toBe('overview');
  });
});
