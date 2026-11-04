import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findVercelFolder, vercelLinkOf } from './folders';

describe('findVercelFolder', () => {
  const home = mkdtempSync(join(tmpdir(), 'pk-folders-'));
  const link = (dir: string, projectId: string) => {
    mkdirSync(join(dir, '.vercel'), { recursive: true });
    writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify({ projectId, orgId: 'team_1' }));
  };
  link(join(home, 'dev', 'shop'), 'prj_shop');
  link(join(home, 'dev', 'mono', 'apps', 'web'), 'prj_web');
  link(join(home, 'dev', 'shop', 'node_modules', 'x'), 'prj_hidden');

  it('finds the linked folder, nested in a monorepo too', () => {
    expect(findVercelFolder('prj_shop', [join(home, 'dev')])).toBe(join(home, 'dev', 'shop'));
    expect(findVercelFolder('prj_web', [join(home, 'dev')])).toBe(join(home, 'dev', 'mono', 'apps', 'web'));
  });
  it('skips node_modules and unknown projects', () => {
    expect(findVercelFolder('prj_hidden', [join(home, 'dev')])).toBeNull();
    expect(findVercelFolder('prj_none', [join(home, 'dev'), join(home, 'missing')])).toBeNull();
  });
  it('reads the link', () => {
    expect(vercelLinkOf(join(home, 'dev', 'shop'))).toEqual({ projectId: 'prj_shop', orgId: 'team_1' });
    expect(vercelLinkOf(home)).toBeNull();
  });
});
