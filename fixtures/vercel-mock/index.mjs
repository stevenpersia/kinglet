// Fake Vercel REST API for tests: same shapes as the real one (subset Parakeet uses).
import { createServer } from 'node:http';

export const TOKEN = 'vercel-test-token';

/**
 * @param {{ previewUrl: string, previewUrl2?: string, prodUrl: string, port?: number }} opts
 *   URLs of the servers that play the deployments (full URLs with scheme, for local tests).
 */
export async function startVercelMock({ previewUrl, previewUrl2, prodUrl, port = 0 }) {
  const now = Date.now();
  const state = { bypass: {}, requests: [], lastQuery: '' };
  const project = () => ({
    id: 'prj_maisonsable',
    name: 'maison-sable',
    framework: 'vite',
    link: { type: 'github', org: 'stevenpersia', repo: 'maison-sable' },
    targets: { production: { id: 'dpl_prod', alias: ['maison-sable.vercel.app', prodUrl] } },
    protectionBypass: state.bypass,
  });
  const deployments = [
    { uid: 'dpl_prod', url: prodUrl, state: 'READY', target: 'production', createdAt: now - 86_400_000, inspectorUrl: 'https://vercel.com/x/maison-sable/dpl_prod', meta: { githubCommitRef: 'main', githubCommitSha: '4f0b7d0', githubCommitMessage: 'fix: footer mobile\n\nlong body', githubCommitAuthorLogin: 'stevenpersia' } },
    { uid: 'dpl_hero', url: previewUrl, state: 'READY', target: null, createdAt: now - 240_000, inspectorUrl: 'https://vercel.com/x/maison-sable/dpl_hero', meta: { githubCommitRef: 'feat/hero', githubCommitSha: 'a91c2e0', githubCommitMessage: 'hero: nouveau titre', githubCommitAuthorLogin: 'claude' } },
    // A long branch name, like the ones Claude Code creates.
    { uid: 'dpl_long', url: previewUrl, state: 'READY', target: null, createdAt: now - 120_000, meta: { githubCommitRef: 'claude/pensive-bardeen-a1b2c3-et-un-nom-tres-long', githubCommitMessage: 'refonte du footer' } },
    { uid: 'dpl_hero_old', url: previewUrl, state: 'READY', target: null, createdAt: now - 3_600_000, meta: { githubCommitRef: 'feat/hero', githubCommitMessage: 'hero: brouillon' } },
    { uid: 'dpl_og', url: previewUrl2 ?? previewUrl, state: 'BUILDING', target: null, createdAt: now - 60_000, meta: { githubCommitRef: 'feat/og-image', githubCommitMessage: 'ajoute og:image' }, creator: { username: 'claude' } },
    { uid: 'dpl_menu', url: 'maison-sable-git-fix-menu.vercel.app', state: 'ERROR', target: null, createdAt: now - 7_200_000, meta: { githubCommitRef: 'fix/menu', githubCommitMessage: 'menu burger iPad' } },
  ];

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    state.requests.push(`${req.method} ${url.pathname}`);
    state.lastQuery = url.search;
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(403, { error: { code: 'forbidden', message: 'Not authorized' } });
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const p = url.pathname;
      if (p === '/v2/user') return send(200, { user: { id: 'usr_1', username: 'stevenpersia', name: 'Steven' } });
      if (p === '/v2/teams') return send(200, { teams: [{ id: 'team_1', slug: 'persia', name: 'Persia' }] });
      if (p === '/v9/projects') return send(200, { projects: [project(), { id: 'prj_other', name: 'autre-site', targets: {} }] });
      if (p === '/v9/projects/prj_maisonsable') return send(200, project());
      if (p === '/v6/deployments') {
        if (url.searchParams.get('projectId') !== 'prj_maisonsable') return send(200, { deployments: [] });
        return send(200, { deployments: deployments.slice(0, Number(url.searchParams.get('limit') ?? 20)) });
      }
      if (p === '/v1/projects/prj_maisonsable/protection-bypass' && req.method === 'PATCH') {
        const body = JSON.parse(raw || '{}');
        if (!body.generate) return send(400, { error: { message: 'missing generate' } });
        state.bypass['mock-bypass-secret'] = { scope: 'automation-bypass', createdAt: Date.now(), createdBy: 'usr_1' };
        return send(200, { protectionBypass: state.bypass });
      }
      send(404, { error: { message: `not found: ${p}` } });
    });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) };
}
