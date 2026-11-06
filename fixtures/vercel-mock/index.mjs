// Fake Vercel REST API for tests: same shapes as the real one (subset Kinglet uses).
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
      // GitHub (same server in tests): the account, the PR of feat/hero and its CI.
      if (p === '/user') return send(200, { login: 'stevenpersia', name: 'Steven' });
      if (p === '/repos/stevenpersia/maison-sable/issues' && req.method === 'POST') {
        state.issue = JSON.parse(raw || '{}');
        return send(201, { number: 7, html_url: 'https://github.com/stevenpersia/maison-sable/issues/7' });
      }
      // Feedback captures: the kinglet-feedback branch, then a file per capture.
      if (p === '/repos/stevenpersia/maison-sable/git/ref/heads/kinglet-feedback') return state.feedbackBranch ? send(200, { object: { sha: 'f00d' } }) : send(404, { message: 'Not Found' });
      if (p === '/repos/stevenpersia/maison-sable') return send(200, { id: 42, full_name: 'stevenpersia/maison-sable', default_branch: 'main' });
      if (p === '/repos/stevenpersia/maison-sable/git/ref/heads/main') return send(200, { object: { sha: '4f0b7d0' } });
      if (p === '/repos/stevenpersia/maison-sable/git/refs' && req.method === 'POST') {
        state.feedbackBranch = JSON.parse(raw || '{}').ref;
        return send(201, { ref: state.feedbackBranch, object: { sha: '4f0b7d0' } });
      }
      if (p.startsWith('/repos/stevenpersia/maison-sable/contents/') && req.method === 'PUT') {
        (state.uploads ??= []).push({ path: p.slice('/repos/stevenpersia/maison-sable/contents/'.length), branch: JSON.parse(raw || '{}').branch });
        return send(201, { content: { path: p } });
      }
      if (p === '/repos/stevenpersia/maison-sable/pulls')
        return send(200, url.searchParams.get('head') === 'stevenpersia:feat/hero' ? [{ number: 12, title: 'Nouveau titre du hero', state: 'open', draft: false, merged_at: null, html_url: 'https://github.com/stevenpersia/maison-sable/pull/12', head: { sha: 'a91c2e0' } }] : []);
      if (p === '/repos/stevenpersia/maison-sable/commits/a91c2e0/check-runs')
        return send(200, { check_runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }] });
      if (p === '/v1/projects/prj_maisonsable/protection-bypass' && req.method === 'PATCH') {
        const body = JSON.parse(raw || '{}');
        if (!body.generate) return send(400, { error: { message: 'missing generate' } });
        state.bypass['mock-bypass-secret'] = { scope: 'automation-bypass', createdAt: Date.now(), createdBy: 'usr_1' };
        return send(200, { protectionBypass: state.bypass });
      }
      // A new project from GitHub, and its first deployment.
      if (p === '/v11/projects' && req.method === 'POST') {
        const body = JSON.parse(raw || '{}');
        state.created = body;
        if (body.gitRepository?.repo === 'stevenpersia/not-installed') return send(400, { error: { code: 'bad_request', message: 'To link a GitHub repository, you need to install the GitHub integration first.' } });
        if (body.name === 'maison-sable') return send(409, { error: { code: 'conflict', message: 'Project already exists' } });
        return send(200, { id: 'prj_new', name: body.name, framework: body.framework, link: { type: 'github', org: body.gitRepository.repo.split('/')[0], repo: body.gitRepository.repo.split('/')[1] }, targets: {} });
      }
      if (p === '/v13/deployments' && req.method === 'POST') {
        const body = JSON.parse(raw || '{}');
        state.deployment = body;
        return send(200, { id: 'dpl_new', url: `${body.name}-abc.vercel.app`, readyState: 'QUEUED', target: body.target ?? null, createdAt: Date.now(), inspectorUrl: 'https://vercel.com/x/y/dpl_new', meta: { githubCommitRef: body.gitSource.ref } });
      }
      send(404, { error: { message: `not found: ${p}` } });
    });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) };
}
