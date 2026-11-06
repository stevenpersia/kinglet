import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, frameworkOf, githubRepoOf, slugify } from './scaffold';
import { pushToGitHub } from './clone';

const tmp = () => mkdtempSync(join(tmpdir(), 'kinglet-new-'));
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('new project', () => {
  it('makes names fit for a folder, npm, GitHub and Vercel', () => {
    expect(slugify('Mon Café Été 2026!')).toBe('mon-cafe-ete-2026');
    expect(slugify('  --Hello__World--  ')).toBe('hello-world');
    expect(slugify('???')).toBe('my-site');
  });

  it('creates an empty folder with git on main, for Claude to fill', async () => {
    const parent = tmp();
    const folder = await createProject({ name: 'Mon Atelier', parent });
    expect(folder).toBe(join(parent, 'mon-atelier'));
    expect(readdirSync(folder)).toEqual(['.git']);
    expect(git(['symbolic-ref', '--short', 'HEAD'], folder)).toBe('main');
  });

  it('refuses a folder that already has files', async () => {
    const parent = tmp();
    mkdirSync(join(parent, 'taken'));
    writeFileSync(join(parent, 'taken', 'x.txt'), 'x');
    await expect(createProject({ name: 'taken', parent })).rejects.toThrow(/isn’t empty|n’est pas vide/);
  });

  it('reads the Vercel framework from package.json', () => {
    const dir = tmp();
    expect(frameworkOf(dir)).toBeNull();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16', react: '19' } }));
    expect(frameworkOf(dir)).toBe('nextjs');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { vite: '8' } }));
    expect(frameworkOf(dir)).toBe('vite');
  });

  it('reads owner/name from GitHub remotes', () => {
    expect(githubRepoOf('https://github.com/stevenpersia/kinglet.git')).toBe('stevenpersia/kinglet');
    expect(githubRepoOf('git@github.com:stevenpersia/kinglet.git')).toBe('stevenpersia/kinglet');
    expect(githubRepoOf('https://gitlab.com/a/b.git')).toBeNull();
    expect(githubRepoOf(null)).toBeNull();
  });

  it('pushes the project to its (empty) repository and tracks it', async () => {
    const parent = tmp();
    const folder = await createProject({ name: 'pushed', parent });
    const bare = join(parent, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', bare]);
    await expect(pushToGitHub(folder, `file://${bare}`, null)).rejects.toThrow(/no commit|aucun commit/);
    writeFileSync(join(folder, 'index.html'), '<h1>hi</h1>');
    git(['add', '.'], folder);
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], folder);
    expect(await pushToGitHub(folder, `file://${bare}`, null)).toBe('main');
    expect(git(['rev-parse', 'main'], bare)).toBe(git(['rev-parse', 'HEAD'], folder));
    expect(git(['rev-parse', '--abbrev-ref', 'main@{upstream}'], folder)).toBe('origin/main');
    // Again: same remote, nothing to do but push.
    expect(await pushToGitHub(folder, `file://${bare}`, null)).toBe('main');
    await expect(pushToGitHub(folder, 'https://github.com/someone/else.git', null)).rejects.toThrow(/already pushes|pousse déjà/);
  });
});
