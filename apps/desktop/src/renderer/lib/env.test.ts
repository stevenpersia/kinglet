import type { VercelDeployment } from '@parakeet/core';
import { describe, expect, it } from 'vitest';
import { envOf, envTargets, timeAgo, urlOnEnv } from './env';

const dep = (p: Partial<VercelDeployment>): VercelDeployment => ({
  id: 'd',
  url: 'https://x.vercel.app',
  state: 'READY',
  production: false,
  createdAt: 0,
  branch: null,
  commitSha: null,
  commitMessage: null,
  author: null,
  inspectorUrl: null,
  ...p,
});

const vercel = {
  project: { id: 'p', name: 'maison-sable', framework: null, repo: null, productionUrl: 'https://maisonsable.fr', bypassSecrets: [] },
  deployments: [
    dep({ id: 'og', url: 'https://ms-og.vercel.app', state: 'BUILDING', branch: 'feat/og' }),
    dep({ id: 'hero', url: 'https://ms-hero.vercel.app', branch: 'feat/hero', createdAt: 2 }),
    dep({ id: 'menu', url: 'https://ms-menu.vercel.app', branch: 'fix/menu', createdAt: 1 }),
    dep({ id: 'prod', url: 'https://ms-prod.vercel.app', production: true, branch: 'main' }),
  ],
};

describe('envOf', () => {
  it('recognises local, preview and production URLs', () => {
    expect(envOf('http://localhost:3000/atelier', vercel)).toBe('local');
    expect(envOf('https://maisonsable.fr/atelier', vercel)).toBe('prod');
    expect(envOf('https://ms-prod.vercel.app/', vercel)).toBe('prod');
    expect(envOf('https://ms-hero.vercel.app/', vercel)).toBe('preview');
    expect(envOf('https://inconnu-git-x.vercel.app/', vercel)).toBe('preview');
    expect(envOf('https://google.com/', vercel)).toBeNull();
    // A deployment served from a local address is still that deployment.
    const local = { ...vercel, deployments: [dep({ url: 'http://127.0.0.1:5176' })] };
    expect(envOf('http://127.0.0.1:5176/', local)).toBe('preview');
    expect(envOf('http://127.0.0.1:5173/', local)).toBe('local');
  });
});

describe('envTargets + urlOnEnv', () => {
  it('defaults to the latest ready preview and keeps the path', () => {
    const t = envTargets('http://localhost:3000', vercel, null);
    expect(t.previews.map((d) => d.id)).toEqual(['hero', 'menu']);
    expect(t.preview?.id).toBe('hero');
    const here = 'http://localhost:3000/atelier?x=1';
    expect(urlOnEnv(here, 'prod', t)).toBe('https://maisonsable.fr/atelier?x=1');
    expect(urlOnEnv(here, 'preview', t)).toBe('https://ms-hero.vercel.app/atelier?x=1');
    expect(urlOnEnv('https://maisonsable.fr/atelier', 'local', t)).toBe('http://localhost:3000/atelier');
  });

  it('uses the chosen preview, and has no target without Vercel', () => {
    expect(envTargets(null, vercel, 'menu').preview?.id).toBe('menu');
    const none = envTargets('http://localhost:5173', null, null);
    expect(urlOnEnv('http://localhost:5173/', 'prod', none)).toBeNull();
  });
});

it('timeAgo', () => {
  expect(timeAgo(0, 30_000)).toBe('à l’instant');
  expect(timeAgo(0, 5 * 60_000)).toBe('il y a 5 min');
  expect(timeAgo(0, 3 * 3_600_000)).toBe('il y a 3 h');
});
