import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DevServerState } from '../shared/types';
import { DevServers, localUrlIn, packageManager } from './devserver';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

const until = async (ok: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return ok();
};

describe('dev server', () => {
  it('finds the address a dev server prints', () => {
    expect(localUrlIn('  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m')).toBe('http://localhost:5173/');
    expect(localUrlIn('- Local:        http://localhost:3000')).toBe('http://localhost:3000/');
    expect(localUrlIn('listening on http://0.0.0.0:8080/')).toBe('http://localhost:8080/');
    expect(localUrlIn('compiling…')).toBeNull();
  });

  it('uses the package manager of the lockfile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-pm-'));
    expect(packageManager(dir)).toBe('npm');
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(packageManager(dir)).toBe('pnpm');
  });

  it('runs the dev script, sees it answer, and stops it', async () => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-dev-'));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'server.cjs'), `require('http').createServer((q, r) => r.end('<h1>ok</h1>')).listen(${port}, () => console.log('Local: http://localhost:${port}/'));`);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { dev: 'node server.cjs' } }));
    const states: DevServerState['status'][] = [];
    const servers = new DevServers((_id, st) => states.push(st.status));
    expect(servers.start('p', dir, null).status).toBe('starting');
    expect(await until(() => servers.state('p')?.status === 'running')).toBe(true);
    expect(servers.state('p')).toMatchObject({ url: `http://localhost:${port}/`, command: 'npm run dev' });
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe('<h1>ok</h1>');
    servers.stop('p');
    expect(servers.state('p')?.status).toBe('stopped');
    expect(states).toContain('running');
    // The whole process group goes: nothing answers any more.
    const down = async () => {
      for (let i = 0; i < 50; i++) {
        const up = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(300) }).then(() => true, () => false);
        if (!up) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };
    expect(await down()).toBe(true);
  }, 30_000);

  it('reports a failing dev script with its last lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-dev-'));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { dev: 'node -e "console.error(\'boom: port taken\'); process.exit(3)"' } }));
    const servers = new DevServers(() => undefined);
    servers.start('p', dir, null);
    expect(await until(() => servers.state('p')?.status === 'error')).toBe(true);
    expect(servers.state('p')?.error).toContain('boom: port taken');
  }, 30_000);

  it('refuses a folder without package.json', () => {
    const servers = new DevServers(() => undefined);
    expect(() => servers.start('p', mkdtempSync(join(tmpdir(), 'kinglet-dev-')), null)).toThrow(/package\.json/);
  });
});
