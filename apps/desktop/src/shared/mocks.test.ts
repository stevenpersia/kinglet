import { describe, expect, it } from 'vitest';
import { globMatch } from './mocks';

describe('globMatch', () => {
  it('matches API URLs with * and ? wildcards', () => {
    expect(globMatch('*/api/plans*', 'http://localhost:3000/api/plans?x=1')).toBe(true);
    expect(globMatch('*/api/plans', 'http://localhost:3000/api/plans/2')).toBe(false);
    expect(globMatch('https://api.example.com/v?/users', 'https://api.example.com/v2/users')).toBe(true);
    expect(globMatch('*.json', 'http://x.dev/data(1).json')).toBe(true);
    expect(globMatch('*/a+b*', 'http://x.dev/a+b')).toBe(true);
    expect(globMatch('*/a+b*', 'http://x.dev/aab')).toBe(false);
  });
});
