import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { t } from '@kinglet/core';
import type { GitHubState, PullRequest } from '../shared/types';

export interface CreatedRepo {
  id: number;
  /** owner/name */
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
}

interface Stored {
  token: string;
  encrypted: boolean;
}

/**
 * GitHub connection (personal token, encrypted like the Vercel one). Optional: today it only
 * identifies the account; the pull request of each preview will come on top of it.
 */
export class GitHubService {
  private file: string;
  private token: string | null = null;
  private userId: number | null = null;
  state: GitHubState = { connected: false, user: null, error: null };

  constructor(
    userData: string,
    private emit: (s: GitHubState) => void,
    private baseUrl = process.env.KINGLET_GITHUB_API ?? 'https://api.github.com',
  ) {
    this.file = join(userData, 'github.json');
  }

  private update(patch: Partial<GitHubState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  private async open() {
    const res = await fetch(`${this.baseUrl}/user`, { headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Kinglet' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) throw new Error(t('GitHub refused this token.', 'GitHub refuse ce jeton.'));
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    const u = (await res.json()) as { id?: number; login: string; name: string | null; avatar_url?: string };
    this.userId = u.id ?? null;
    this.update({ connected: true, user: { login: u.login, name: u.name }, error: null });
  }

  async restore() {
    if (!existsSync(this.file)) return;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Stored;
      this.token = s.encrypted ? safeStorage.decryptString(Buffer.from(s.token, 'base64')) : s.token;
      await this.open();
    } catch (e) {
      this.update({ error: t(`Couldn’t connect to GitHub: ${(e as Error).message}`, `Connexion GitHub impossible : ${(e as Error).message}`) });
    }
  }

  async connect(token: string) {
    const clean = token.trim();
    this.token = clean;
    try {
      await this.open();
    } catch (e) {
      this.token = null;
      this.update({ connected: false, user: null, error: (e as Error).message });
      return this.state;
    }
    const encrypted = safeStorage.isEncryptionAvailable();
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ token: encrypted ? safeStorage.encryptString(clean).toString('base64') : clean, encrypted } satisfies Stored), { mode: 0o600 });
    chmodSync(this.file, 0o600);
    return this.state;
  }

  /** The connected token, to clone a repository (given to git for one command only). */
  cloneToken() {
    return this.state.connected ? this.token : null;
  }

  private cache = new Map<string, { at: number; pr: PullRequest | null }>();

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Kinglet' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** The PR of each branch (latest one), with the CI of its head commit. Cached a minute. */
  async pullRequests(repo: string, branches: string[]): Promise<Record<string, PullRequest>> {
    if (!this.token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return {};
    const owner = repo.split('/')[0]!;
    const out: Record<string, PullRequest> = {};
    await Promise.all(
      [...new Set(branches)].slice(0, 20).map(async (branch) => {
        const key = `${repo}#${branch}`;
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < 60_000) {
          if (hit.pr) out[branch] = hit.pr;
          return;
        }
        try {
          type Pr = { number: number; title: string; state: string; draft?: boolean; merged_at: string | null; html_url: string; head: { sha: string } };
          const prs = await this.get<Pr[]>(`/repos/${repo}/pulls?state=all&per_page=1&head=${encodeURIComponent(`${owner}:${branch}`)}`);
          const p = prs[0];
          let pr: PullRequest | null = null;
          if (p) {
            const runs = await this.get<{ check_runs: { status: string; conclusion: string | null }[] }>(`/repos/${repo}/commits/${p.head.sha}/check-runs?per_page=100`).catch(() => ({ check_runs: [] }));
            const total = runs.check_runs.length;
            const passed = runs.check_runs.filter((r) => r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral').length;
            const failed = runs.check_runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.conclusion === 'cancelled');
            const running = runs.check_runs.some((r) => r.status !== 'completed');
            pr = {
              branch,
              number: p.number,
              title: p.title,
              state: p.merged_at ? 'merged' : p.state === 'closed' ? 'closed' : p.draft ? 'draft' : 'open',
              url: p.html_url,
              checks: total ? { state: failed ? 'failure' : running ? 'pending' : 'success', passed, total } : null,
            };
          }
          this.cache.set(key, { at: Date.now(), pr });
          if (pr) out[branch] = pr;
        } catch {
          /* no access to this repository, rate limit: no PR shown */
        }
      }),
    );
    return out;
  }

  async createIssue(repo: string, title: string, body: string): Promise<string> {
    if (!this.token) throw new Error(t('GitHub not connected', 'GitHub non connecté'));
    const res = await fetch(`${this.baseUrl}/repos/${repo}/issues`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Kinglet', 'content-type': 'application/json' },
      body: JSON.stringify({ title, body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 403 || res.status === 404) throw new Error(t('This token can’t open issues in this repository (it needs Issues: write).', 'Ce jeton ne peut pas ouvrir d’issue dans ce dépôt (il faut Issues : écriture).'));
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    return ((await res.json()) as { html_url: string }).html_url;
  }

  /**
   * Feedback captures into the repository, so an issue can show them (the API can't attach images to an
   * issue). They go on a branch of their own, never on the default one. Returns one URL per image.
   */
  async uploadImages(repo: string, folder: string, images: { name: string; dataUrl: string }[]): Promise<string[]> {
    if (!this.token) throw new Error(t('GitHub not connected', 'GitHub non connecté'));
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('invalid repository');
    const branch = 'kinglet-feedback';
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Kinglet', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const denied = () => new Error(t('This token can’t write in this repository (it needs Contents: write): the captures were left out.', 'Ce jeton ne peut pas écrire dans ce dépôt (il faut Contents : écriture) : les captures n’ont pas été jointes.'));
    // The branch, created from the default one the first time.
    const ref = await call('GET', `/repos/${repo}/git/ref/heads/${branch}`);
    if (ref.status === 404) {
      const info = await call('GET', `/repos/${repo}`);
      const base = String(info.json.default_branch ?? 'main');
      const head = await call('GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
      const sha = (head.json.object as { sha?: string } | undefined)?.sha;
      if (!sha) throw new Error(`GitHub: HTTP ${head.status}`);
      const made = await call('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha });
      if (made.status === 403 || made.status === 404) throw denied();
      if (made.status >= 300 && made.status !== 422) throw new Error(`GitHub: HTTP ${made.status}`);
    } else if (ref.status >= 300) throw ref.status === 403 ? denied() : new Error(`GitHub: HTTP ${ref.status}`);
    const urls: string[] = [];
    for (const img of images) {
      const path = `${folder}/${img.name}`.replace(/[^\w./-]+/g, '-');
      const content = img.dataUrl.replace(/^data:[^,]*,/, '');
      const put = await call('PUT', `/repos/${repo}/contents/${path}`, { message: `Feedback capture: ${img.name}`, content, branch });
      if (put.status === 403 || put.status === 404) throw denied();
      if (put.status >= 300) throw new Error(`GitHub: HTTP ${put.status}`);
      urls.push(`https://github.com/${repo}/blob/${branch}/${path}?raw=true`);
    }
    return urls;
  }

  /** Who signs the first commit when git has no identity on this computer: the account's noreply address. */
  identity(): { name: string; email: string } | null {
    const u = this.state.user;
    if (!u) return null;
    return { name: u.name || u.login, email: this.userId ? `${this.userId}+${u.login}@users.noreply.github.com` : `${u.login}@users.noreply.github.com` };
  }

  /** Accounts a repository can be created in: the user, then their organizations. */
  async owners(): Promise<string[]> {
    if (!this.token || !this.state.user) return [];
    const orgs = await this.get<{ login: string }[]>('/user/orgs?per_page=100').catch(() => []);
    return [this.state.user.login, ...orgs.map((o) => o.login)];
  }

  /** Create an empty repository (no README: the project's first commit is pushed into it). */
  async createRepo(opts: { name: string; owner?: string | null; private: boolean; description?: string }): Promise<CreatedRepo> {
    if (!this.token || !this.state.user) throw new Error(t('Connect GitHub first (Settings → GitHub).', 'Connecte d’abord GitHub (Réglages → GitHub).'));
    const org = opts.owner && opts.owner !== this.state.user.login ? opts.owner : null;
    const res = await fetch(`${this.baseUrl}${org ? `/orgs/${encodeURIComponent(org)}/repos` : '/user/repos'}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Kinglet', 'content-type': 'application/json' },
      body: JSON.stringify({ name: opts.name, private: opts.private, description: opts.description ?? '', auto_init: false }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[]; id?: number; full_name?: string; clone_url?: string; html_url?: string; default_branch?: string };
    if (res.status === 422) throw new Error(t(`A repository named “${opts.name}” already exists in ${org ?? this.state.user.login}, or the name isn’t allowed.`, `Un dépôt « ${opts.name} » existe déjà chez ${org ?? this.state.user.login}, ou ce nom n’est pas accepté.`));
    if (res.status === 401 || res.status === 403 || res.status === 404)
      throw new Error(
        t(
          'This GitHub token can’t create repositories. Give it Administration: Read and write and Contents: Read and write on all repositories (fine-grained token), or the repo scope (classic token).',
          'Ce jeton GitHub ne peut pas créer de dépôt. Donne-lui Administration : lecture et écriture et Contents : lecture et écriture sur tous les dépôts (jeton fin), ou le scope repo (jeton classique).',
        ),
      );
    if (!res.ok) throw new Error(`GitHub: ${body.errors?.[0]?.message ?? body.message ?? `HTTP ${res.status}`}`);
    return { id: body.id!, fullName: body.full_name!, cloneUrl: body.clone_url!, htmlUrl: body.html_url! };
  }

  /** A repository's numeric id (Vercel deploys a commit from it). */
  async repoId(fullName: string): Promise<number> {
    return (await this.get<{ id: number }>(`/repos/${fullName}`)).id;
  }

  disconnect() {
    this.token = null;
    this.userId = null;
    rmSync(this.file, { force: true });
    this.update({ connected: false, user: null, error: null });
    return this.state;
  }
}
