import { describe, expect, it } from 'vitest';
import { consolePrompt, groupEntries } from './console.ts';
import { setLanguage } from './i18n.ts';

const e = (deviceId: string, text: string, extra = {}) => ({ deviceId, source: 'console' as const, level: 'error' as const, text, url: 'http://localhost:5173/src/main.ts', line: 12, ...extra });

describe('console prompt', () => {
  it('groups the same error seen on several devices', () => {
    const g = groupEntries([e('iphone', 'boom'), e('ipad', 'boom'), e('iphone', 'boom'), e('iphone', 'other')]);
    expect(g.map((x) => [x.entry.text, x.devices, x.count])).toEqual([
      ['boom', ['iphone', 'ipad'], 3],
      ['other', ['iphone'], 1],
    ]);
  });

  it('writes a prompt for Claude, in the chosen language', () => {
    const entries = [e('iphone', 'TypeError: x is undefined'), { deviceId: 'ipad', source: 'network' as const, level: 'error' as const, text: '404 Not Found', url: 'http://localhost:5173/og.png', status: 404 }];
    const p = consolePrompt(entries, { pageUrl: 'http://localhost:5173/', labels: { iphone: 'iPhone 16', ipad: 'iPad Air' }, throttled: 'slow 3G' });
    expect(p).toContain('[error] TypeError: x is undefined (/src/main.ts:12) · iPhone 16');
    expect(p).toContain('[network] 404 Not Found (GET /og.png) · iPad Air');
    expect(p).toContain('slow 3G');
    setLanguage('fr');
    expect(consolePrompt(entries, { pageUrl: 'http://localhost:5173/' })).toContain('Parakeet a vu ces erreurs');
    setLanguage('en');
    expect(consolePrompt([], { pageUrl: null })).toBe('No errors in the console of the page.');
  });
});
