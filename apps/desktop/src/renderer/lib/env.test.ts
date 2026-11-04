import { setLanguage, type VercelDeployment } from '@parakeet/core';
import { describe, expect, it } from 'vitest';
import { envOf, envTargets, oldProdOf, productionsOf, timeAgo, urlOnEnv } from './env';

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
  project: { id: 'p', name: 'maison-sable', framework: null, repo: null, productionUrl: 'https://maisonsable.fr', bypassSecrets: [], teamId: null },
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
  expect(timeAgo(0, 30_000)).toBe('just now');
  expect(timeAgo(0, 5 * 60_000)).toBe('5 min ago');
  expect(timeAgo(0, 3 * 3_600_000)).toBe('3 h ago');
  setLanguage('fr');
  expect(timeAgo(0, 5 * 60_000)).toBe('il y a 5 min');
  setLanguage('en');
});

describe('production deployments', () => {
  const prods = {
    ...vercel,
    project: { ...vercel.project, productionDeploymentId: 'p2' },
    deployments: [
      dep({ id: 'p3', url: 'https://ms-p3.vercel.app', production: true, createdAt: 30, state: 'ERROR' }),
      dep({ id: 'p2', url: 'https://ms-p2.vercel.app', production: true, createdAt: 20 }),
      dep({ id: 'p1', url: 'https://ms-p1.vercel.app', production: true, createdAt: 10 }),
      dep({ id: 'p4', url: 'https://ms-p4.vercel.app', production: true, createdAt: 40, state: 'BUILDING' }),
    ],
  };

  it('lists ready and failed productions, newest first, and knows the live one', () => {
    const { prods: list, live } = productionsOf(prods);
    expect(list.map((d) => d.id)).toEqual(['p3', 'p2', 'p1']);
    expect(live?.id).toBe('p2'); // what Vercel serves (e.g. after a rollback), not the newest
    expect(productionsOf({ ...prods, project: { ...prods.project, productionDeploymentId: null } }).live?.id).toBe('p2'); // newest ready
  });

  it('opens an older production on its own address, and tells it apart from the live one', () => {
    const t = envTargets(null, prods, null, 'p1');
    expect(t.oldProd?.id).toBe('p1');
    expect(urlOnEnv('https://maisonsable.fr/atelier', 'prod', t)).toBe('https://ms-p1.vercel.app/atelier');
    expect(envTargets(null, prods, null, 'p2').oldProd).toBeNull(); // the live one: back to the domain
    expect(envTargets(null, prods, null, 'p3').oldProd).toBeNull(); // failed: never served
    expect(oldProdOf('https://ms-p1.vercel.app/atelier', prods)?.id).toBe('p1');
    expect(oldProdOf('https://ms-p2.vercel.app/', prods)).toBeNull();
    expect(oldProdOf('https://maisonsable.fr/', prods)).toBeNull();
    expect(oldProdOf('https://ms-hero.vercel.app/', prods)).toBeNull();
  });
});
