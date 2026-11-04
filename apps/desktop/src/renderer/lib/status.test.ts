import { describe, expect, it } from 'vitest';
import type { ClaudeProjectState } from '../../shared/types';
import { initials, projectStatus } from './status';

const claude = (p: Partial<ClaudeProjectState>): ClaudeProjectState => ({ status: 'idle', since: 0, lastAt: 0, prompt: null, lastAction: null, files: [], seen: true, events: [], ...p });
const dep = (state: string) => ({ id: state, url: 'https://x.vercel.app', state, production: false, createdAt: 0, branch: 'fix/menu', commitSha: null, commitMessage: 'fix', author: null, inspectorUrl: null }) as never;

describe('projectStatus', () => {
  it('Claude first, then builds', () => {
    expect(projectStatus(claude({ status: 'working', since: 0 }), [dep('ERROR')], 3 * 60_000)).toMatchObject({ kind: 'working', short: '3 min' });
    expect(projectStatus(claude({ status: 'waiting' }), []).kind).toBe('waiting');
    expect(projectStatus(claude({ status: 'done', seen: false, files: ['a/b/c.tsx', 'd.ts'] }), [], 0)).toMatchObject({ kind: 'review', detail: '2 files changed: b/c.tsx, d.ts' });
    expect(projectStatus(claude({ status: 'done', seen: true }), [dep('ERROR')]).kind).toBe('error');
    expect(projectStatus(undefined, [dep('BUILDING')]).kind).toBe('building');
    expect(projectStatus(undefined, [dep('READY'), dep('ERROR')]).kind).toBe('idle');
  });
});

it('initials', () => {
  expect(initials('maison-sable')).toBe('MS');
  expect(initials('portfolio')).toBe('PO');
  expect(initials('localhost:5173')).toBe('L5');
  expect(initials('127.0.0.1:5175')).toBe('15');
});
