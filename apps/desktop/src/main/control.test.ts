// The MCP control server: a Claude working on a project that isn't on screen never moves the visible devices.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startControlServer } from './control';
import type { DeviceManager } from './devices';

const dirs: string[] = [];
const servers: { close(): void }[] = [];
afterEach(() => {
  servers.splice(0).forEach((s) => s.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

const preset = { id: 'iphone-16', label: 'iPhone 16', kind: 'phone' };

async function setup() {
  const calls: string[] = [];
  const devices = {
    currentUrl: 'https://shown.example/',
    entries: () => [{ preset }],
    viewport: () => ({ width: 393, height: 852 }),
    capture: async () => {
      calls.push('capture');
      return 'VISIBLE';
    },
    scrollTo: async () => true,
    snapshot: async (url: string) => {
      calls.push(`snapshot ${url}`);
      return { image: 'data:image/png;base64,OFFSCREEN', vitals: null, error: null };
    },
  } as unknown as DeviceManager;
  const userData = mkdtempSync(join(tmpdir(), 'kinglet-control-'));
  dirs.push(userData);
  let base = '';
  let auth = '';
  const listening = new Promise<void>((resolve) => {
    servers.push(
      startControlServer({
        devices,
        version: 'test',
        userData,
        analyze: async (url, projectId) => {
          calls.push(`analyze ${url} ${projectId ?? 'shown'}`);
          return { url };
        },
        background: (cwd) => (cwd.startsWith('/dev/other') ? { id: 'other', name: 'other', url: 'http://localhost:4000/' } : null),
        remember: (id, url) => calls.push(`remember ${id} ${url}`),
        setActive: () => undefined,
        navigate: async (url) => {
          calls.push(`navigate ${url}`);
        },
        onActivity: () => undefined,
        deployments: (projectId) => ({ project: projectId ?? 'shown', deployments: [] }),
        logs: () => ({ url: 'https://shown.example/', logs: [] }),
        onListen: (port, token) => {
          base = `http://127.0.0.1:${port}`;
          auth = `Bearer ${token}`;
          resolve();
        },
      }),
    );
  });
  await listening;
  const call = async (method: string, path: string, cwd: string | null, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: auth, 'content-type': 'application/json', ...(cwd ? { 'x-kinglet-cwd': encodeURIComponent(cwd) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  return { call, calls };
}

it('works on the calling project, off screen, when its tab is not the one shown', async () => {
  const { call, calls } = await setup();
  expect((await call('GET', '/status', '/dev/other/src')).json).toMatchObject({ url: 'http://localhost:4000/', background: 'other' });
  expect((await call('POST', '/navigate', '/dev/other', { url: 'http://localhost:4000/pricing' })).json).toMatchObject({ url: 'http://localhost:4000/pricing', background: 'other' });
  const shot = await call('POST', '/screenshot', '/dev/other', {});
  expect(shot.json.shots).toEqual([{ id: 'iphone-16', label: 'iPhone 16', mime: 'image/png', data: 'OFFSCREEN', width: 393, height: 852 }]);
  await call('POST', '/analyze', '/dev/other', { url: null });
  expect((await call('GET', '/deployments', '/dev/other')).json.project).toBe('other');
  expect((await call('GET', '/logs', '/dev/other')).status).toBe(409);
  expect(calls).toEqual(['remember other http://localhost:4000/pricing', 'snapshot http://localhost:4000/', 'analyze http://localhost:4000/ other']);
});

it('keeps driving the devices on screen for the project shown, or without a folder', async () => {
  const { call, calls } = await setup();
  expect((await call('GET', '/status', '/dev/shown')).json).toMatchObject({ url: 'https://shown.example/' });
  await call('POST', '/navigate', null, { url: 'https://shown.example/a' });
  const shot = await call('POST', '/screenshot', '/dev/shown', {});
  expect((shot.json.shots as { data: string }[])[0]!.data).toBe('VISIBLE');
  expect(calls).toEqual(['navigate https://shown.example/a', 'capture']);
});
