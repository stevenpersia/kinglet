import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS test fixture
import { startVercelMock, TOKEN } from '../../../fixtures/vercel-mock/index.mjs';
import { previewsByBranch, samePageOn, VercelClient, VercelError } from './index.ts';

let mock: { url: string; state: { requests: string[]; lastQuery: string }; close(): Promise<void> };

beforeAll(async () => {
  mock = await startVercelMock({ previewUrl: 'maison-sable-git-feat-hero.vercel.app', prodUrl: 'maisonsable.fr' });
});
afterAll(() => mock.close());

const client = (token = TOKEN, teamId?: string) => new VercelClient({ token, teamId, baseUrl: mock.url });

describe('VercelClient', () => {
  it('reads the user, teams and projects', async () => {
    expect(await client().user()).toMatchObject({ username: 'stevenpersia' });
    expect(await client().teams()).toEqual([{ id: 'team_1', slug: 'persia', name: 'Persia' }]);
    const projects = await client().projects();
    expect(projects.map((p) => p.name)).toEqual(['autre-site', 'maison-sable']);
    // Custom domain preferred over *.vercel.app
    expect(projects[1]).toMatchObject({ repo: 'stevenpersia/maison-sable', productionUrl: 'https://maisonsable.fr', bypassSecrets: [] });
  });

  it('sends the team id when one is chosen', async () => {
    await client(TOKEN, 'team_1').user();
    expect(mock.state.requests.at(-1)).toBe('GET /v2/user');
    expect(new URLSearchParams(mock.state.lastQuery).get('teamId')).toBe('team_1');
    await client().user();
    expect(new URLSearchParams(mock.state.lastQuery).has('teamId')).toBe(false);
  });

  it('parses deployments: state, target, git metadata, first line of the message', async () => {
    const deps = await client().deployments('prj_maisonsable');
    expect(deps.map((d) => d.id)).toEqual(['dpl_og', 'dpl_hero', 'dpl_hero_old', 'dpl_menu', 'dpl_prod']);
    const prod = deps.find((d) => d.production)!;
    expect(prod).toMatchObject({ url: 'https://maisonsable.fr', state: 'READY', branch: 'main', commitMessage: 'fix: footer mobile', author: 'stevenpersia' });
    expect(deps.find((d) => d.id === 'dpl_og')).toMatchObject({ state: 'BUILDING', author: 'claude' });
  });

  it('keeps the latest ready preview per branch', async () => {
    const previews = previewsByBranch(await client().deployments('prj_maisonsable'));
    expect(previews.map((d) => d.id)).toEqual(['dpl_hero']);
  });

  it('generates a protection bypass secret on request', async () => {
    const p = await client().generateBypass('prj_maisonsable');
    expect(p.bypassSecrets).toEqual(['mock-bypass-secret']);
  });

  it('explains a refused token', async () => {
    await expect(client('wrong').user()).rejects.toThrowError(VercelError);
    await expect(client('wrong').user()).rejects.toThrow(/Jeton Vercel refusé/);
  });
});

describe('samePageOn', () => {
  it('keeps path, query and hash when switching environment', () => {
    expect(samePageOn('http://localhost:3000/atelier?x=1#top', 'https://maisonsable.fr')).toBe('https://maisonsable.fr/atelier?x=1#top');
    expect(samePageOn(null, 'https://maisonsable.fr')).toBe('https://maisonsable.fr/');
  });
});
