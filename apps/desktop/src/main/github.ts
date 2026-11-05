import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { t } from '@kinglet/core';
import type { GitHubState, PullRequest } from '../shared/types';

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
    const u = (await res.json()) as { login: string; name: string | null; avatar_url?: string };
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

  disconnect() {
    this.token = null;
    rmSync(this.file, { force: true });
    this.update({ connected: false, user: null, error: null });
    return this.state;
  }
}
