import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, frameworkOf, githubRepoOf, pickPort, slugify, TEMPLATES } from './scaffold';
import { pushToGitHub } from './clone';

const tmp = () => mkdtempSync(join(tmpdir(), 'kinglet-new-'));
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('new project', () => {
  it('makes names fit for a folder, npm, GitHub and Vercel', () => {
    expect(slugify('Mon Café Été 2026!')).toBe('mon-cafe-ete-2026');
    expect(slugify('  --Hello__World--  ')).toBe('hello-world');
    expect(slugify('???')).toBe('my-site');
  });

  it('writes every template with its port in the dev script, and a first commit on main', async () => {
    for (const id of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
      const parent = tmp();
      const folder = await createProject({ name: 'Mon Site', parent, template: id, port: 4567, identity: { name: 'Test', email: 'test@example.com' } });
      expect(folder).toBe(join(parent, 'mon-site'));
      const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
      expect(pkg.name).toBe('mon-site');
      expect(pkg.scripts.dev).toContain('4567');
      expect(pkg.scripts.build).toBeTruthy();
      expect(readFileSync(join(folder, 'CLAUDE.md'), 'utf8')).toContain('http://localhost:4567');
      expect(readFileSync(join(folder, '.gitignore'), 'utf8')).toMatch(/node_modules[\s\S]*\.vercel/);
      expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], folder)).toBe('main');
      expect(git(['log', '--format=%s'], folder)).toBe('First commit (created with Kinglet)');
      expect(git(['status', '--porcelain'], folder)).toBe('');
      expect(frameworkOf(folder)).toBe(TEMPLATES[id].framework);
    }
  });

  it('escapes the name in the page and refuses a folder that already has files', async () => {
    const parent = tmp();
    const folder = await createProject({ name: 'A <b> & "c"', parent, template: 'static', port: 5173 });
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    mkdirSync(join(parent, 'taken'));
    writeFileSync(join(parent, 'taken', 'x.txt'), 'x');
    await expect(createProject({ name: 'taken', parent, template: 'static', port: 5173 })).rejects.toThrow(/isn’t empty|n’est pas vide/);
  });

  it('picks a port no known project uses and nothing listens on', async () => {
    expect(await pickPort(5173, new Set([5173, 5174]), async () => true)).toBe(5175);
    expect(await pickPort(3000, new Set(), async (p) => p !== 3000)).toBe(3001);
  });

  it('reads owner/name from GitHub remotes', () => {
    expect(githubRepoOf('https://github.com/stevenpersia/kinglet.git')).toBe('stevenpersia/kinglet');
    expect(githubRepoOf('git@github.com:stevenpersia/kinglet.git')).toBe('stevenpersia/kinglet');
    expect(githubRepoOf('https://gitlab.com/a/b.git')).toBeNull();
    expect(githubRepoOf(null)).toBeNull();
  });

  it('pushes the new project to its (empty) repository and tracks it', async () => {
    const parent = tmp();
    const folder = await createProject({ name: 'pushed', parent, template: 'static', port: 5173, identity: { name: 'Test', email: 'test@example.com' } });
    const bare = join(parent, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', bare]);
    expect(await pushToGitHub(folder, `file://${bare}`, null)).toBe('main');
    expect(git(['rev-parse', 'main'], bare)).toBe(git(['rev-parse', 'HEAD'], folder));
    expect(git(['rev-parse', '--abbrev-ref', 'main@{upstream}'], folder)).toBe('origin/main');
    // Again: same remote, nothing to do but push.
    expect(await pushToGitHub(folder, `file://${bare}`, null)).toBe('main');
    await expect(pushToGitHub(folder, 'https://github.com/someone/else.git', null)).rejects.toThrow(/already pushes|pousse déjà/);
    expect(existsSync(join(folder, '.git'))).toBe(true);
  });
});
