import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloneRepo, repoName } from './clone';

const sh = (args: string[], cwd: string) => execFileSync('git', args, { cwd, stdio: 'ignore' });

function bareRepo() {
  const root = mkdtempSync(join(tmpdir(), 'kinglet-clone-'));
  const work = join(root, 'work');
  mkdirSync(work);
  sh(['init', '-q', '-b', 'main'], work);
  writeFileSync(join(work, 'index.html'), '<h1>hi</h1>');
  sh(['add', '.'], work);
  sh(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], work);
  sh(['clone', '-q', '--bare', work, join(root, 'site.git')], root);
  return { root, url: `file://${join(root, 'site.git')}` };
}

describe('cloneRepo', () => {
  it('names the folder after the repository', () => {
    expect(repoName('https://github.com/stevenpersia/maison-sable.git')).toBe('maison-sable');
    expect(repoName('git@github.com:stevenpersia/kinglet')).toBe('kinglet');
  });

  it('clones into parent/<name>, then reuses that clone', async () => {
    const { root, url } = bareRepo();
    const parent = join(root, 'code');
    mkdirSync(parent);
    const folder = await cloneRepo(url, parent);
    expect(folder).toBe(join(parent, 'site'));
    expect(existsSync(join(folder, 'index.html'))).toBe(true);
    expect(await cloneRepo(url, parent)).toBe(folder);
  });

  it('refuses a folder that holds something else', async () => {
    const { root, url } = bareRepo();
    mkdirSync(join(root, 'code', 'site'), { recursive: true });
    await expect(cloneRepo(url, join(root, 'code'))).rejects.toThrow(/already exists/);
  });
});
