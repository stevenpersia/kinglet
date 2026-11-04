import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { t } from '@parakeet/core';
import type { GitHubState } from '../shared/types';

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
    private baseUrl = process.env.PARAKEET_GITHUB_API ?? 'https://api.github.com',
  ) {
    this.file = join(userData, 'github.json');
  }

  private update(patch: Partial<GitHubState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  private async open() {
    const res = await fetch(`${this.baseUrl}/user`, { headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'Parakeet' }, signal: AbortSignal.timeout(10_000) });
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

  disconnect() {
    this.token = null;
    rmSync(this.file, { force: true });
    this.update({ connected: false, user: null, error: null });
    return this.state;
  }
}
