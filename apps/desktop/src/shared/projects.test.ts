import { describe, expect, it } from 'vitest';
import { closeProject, migrateSettings, openProject, projectForFolder, projectFromUrl, visit } from './projects';
import type { Project, Settings } from './types';

const base: Settings = { projects: [], openIds: [], activeId: null, recentUrls: [], active: [], scrollSync: true, landscape: false };
const p = (id: string, extra: Partial<Project> = {}): Project => ({ id, name: id, vercelProjectId: null, teamId: null, localOrigin: null, folder: null, lastUrl: null, ...extra });

describe('migrateSettings', () => {
  it('turns the single site of older settings into the first project', () => {
    const m = migrateSettings({ url: 'http://localhost:5173/atelier', localOrigin: 'http://localhost:5173' });
    expect(m.projects).toEqual([expect.objectContaining({ id: 'local:http://localhost:5173', name: 'localhost:5173', localOrigin: 'http://localhost:5173', lastUrl: 'http://localhost:5173/atelier' })]);
    expect(m.openIds).toEqual(['local:http://localhost:5173']);
    expect(m.activeId).toBe('local:http://localhost:5173');
    expect(m).not.toHaveProperty('url');
  });

  it('keeps new settings and handles a first run', () => {
    expect(migrateSettings({ projects: [p('a')] }).projects).toHaveLength(1);
    expect(migrateSettings({})).toMatchObject({ projects: [], openIds: [], activeId: null });
  });
});

describe('tabs', () => {
  it('opens a project once, active, at the end', () => {
    let s = { ...base, ...openProject(base, p('a')) };
    s = { ...s, ...openProject(s, p('b')) };
    s = { ...s, ...openProject(s, p('a')) };
    expect(s.openIds).toEqual(['a', 'b']);
    expect(s.projects).toHaveLength(2);
    expect(s.activeId).toBe('a');
  });

  it('closing the active tab activates its neighbour, the project stays known', () => {
    const s = { ...base, projects: [p('a'), p('b'), p('c')], openIds: ['a', 'b', 'c'], activeId: 'b' };
    expect(closeProject(s, 'b')).toEqual({ openIds: ['a', 'c'], activeId: 'c' });
    expect(closeProject(s, 'c')).toEqual({ openIds: ['a', 'b'], activeId: 'b' });
    expect(closeProject({ ...s, openIds: ['b'] }, 'b')).toEqual({ openIds: [], activeId: null });
  });

  it('remembers the last page of the active project', () => {
    const s = { ...base, projects: [p('a'), p('b')], openIds: ['a', 'b'], activeId: 'b' };
    const v = visit(s, 'https://x.dev/page');
    expect(v.projects.find((x) => x.id === 'b')?.lastUrl).toBe('https://x.dev/page');
    expect(v.projects.find((x) => x.id === 'a')?.lastUrl).toBeNull();
    expect(v.recentUrls[0]).toBe('https://x.dev/page');
  });
});

describe('projectForFolder', () => {
  it('finds the deepest project folder containing the session cwd', () => {
    const projects = [p('mono', { folder: '/home/s/dev/mono' }), p('web', { folder: '/home/s/dev/mono/apps/web/' }), p('other', { folder: '/home/s/dev/other' })];
    expect(projectForFolder(projects, '/home/s/dev/mono/apps/web/src')?.id).toBe('web');
    expect(projectForFolder(projects, '/home/s/dev/mono/packages/x')?.id).toBe('mono');
    expect(projectForFolder(projects, '/home/s/dev/monorepo')).toBeNull();
    expect(projectForFolder(projects, '/tmp')).toBeNull();
  });
});

it('projectFromUrl', () => {
  expect(projectFromUrl('https://maisonsable.fr/a')).toMatchObject({ id: 'local:https://maisonsable.fr', name: 'maisonsable.fr', localOrigin: null });
});
