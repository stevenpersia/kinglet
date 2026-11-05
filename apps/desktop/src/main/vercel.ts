import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { t, VercelClient, type VercelDeployment } from '@kinglet/core';
import type { VercelState, VercelTeamProject } from '../shared/types';

interface Stored {
  /** Token encrypted with safeStorage (base64), or in clear when no encryption is available. */
  token: string;
  encrypted: boolean;
  /** Before multi-project: the one linked project (migrated into a Kinglet project). */
  teamId?: string | null;
  projectId?: string | null;
}

const REFRESH_MS = 30_000;

/** Which Vercel projects to follow: the ones open in Kinglet's tabs. */
export interface Watched {
  projectId: string;
  teamId: string | null;
}

/**
 * Vercel connection (personal token, encrypted with the system keyring through safeStorage).
 * Lists the projects of every team for the project switcher, and follows the deployments
 * of the projects open in tabs (every 30 s).
 */
export class VercelService {
  private file: string;
  private stored: Stored | null = null;
  private token: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private watched: Watched[] = [];
  state: VercelState = { connected: false, user: null, teams: [], projects: [], deployments: {}, error: null, storage: 'none', syncedAt: null };

  constructor(
    userData: string,
    private emit: (s: VercelState) => void,
    private baseUrl = process.env.KINGLET_VERCEL_API,
  ) {
    this.file = join(userData, 'vercel.json');
  }

  private client(teamId: string | null) {
    if (!this.token) throw new Error(t('Vercel not connected', 'Vercel non connecté'));
    return new VercelClient({ token: this.token, teamId, baseUrl: this.baseUrl });
  }

  private storageBackend(): VercelState['storage'] {
    if (!safeStorage.isEncryptionAvailable()) return 'none';
    // On Linux, without a keyring Chromium falls back to a fixed key ("basic_text").
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'keyring';
    return backend === 'basic_text' || backend === 'unknown' ? 'basic' : 'keyring';
  }

  private save() {
    if (!this.stored) return rmSync(this.file, { force: true });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.stored), { mode: 0o600 });
    chmodSync(this.file, 0o600);
  }

  private update(patch: Partial<VercelState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  /** The project linked before multi-project support, if any (to migrate it). */
  legacyLink(): Watched | null {
    return this.stored?.projectId ? { projectId: this.stored.projectId, teamId: this.stored.teamId ?? null } : null;
  }

  /** Restore the saved connection at startup. */
  async restore() {
    if (!existsSync(this.file)) return;
    try {
      this.stored = JSON.parse(readFileSync(this.file, 'utf8'));
      this.token = this.stored!.encrypted ? safeStorage.decryptString(Buffer.from(this.stored!.token, 'base64')) : this.stored!.token;
      await this.open();
    } catch (e) {
      this.update({ error: t(`Couldn’t connect to Vercel: ${(e as Error).message}`, `Connexion Vercel impossible : ${(e as Error).message}`) });
    }
  }

  /** User, teams, and the projects of every team. */
  private async open() {
    const personal = this.client(null);
    const [user, teams] = await Promise.all([personal.user(), personal.teams()]);
    const lists = await Promise.all([null, ...teams.map((t) => t.id)].map(async (teamId) => (await this.client(teamId).projects().catch(() => [])).map((p): VercelTeamProject => ({ ...p, teamId }))));
    const seen = new Set<string>();
    const projects = lists.flat().filter((p) => !seen.has(p.id) && seen.add(p.id));
    this.update({ connected: true, user, teams, projects, error: null, storage: this.storageBackend() });
    this.startPolling();
  }

  async connect(token: string) {
    const clean = token.trim();
    this.token = clean;
    try {
      await this.open(); // throws on a refused token: nothing saved
    } catch (e) {
      this.token = null;
      throw e;
    }
    const encrypted = safeStorage.isEncryptionAvailable();
    this.stored = { token: encrypted ? safeStorage.encryptString(clean).toString('base64') : clean, encrypted };
    this.save();
  }

  disconnect() {
    this.stop();
    this.stored = null;
    this.token = null;
    this.save();
    this.update({ connected: false, user: null, teams: [], projects: [], deployments: {}, error: null, syncedAt: null });
  }

  async refreshProjects() {
    if (this.token) await this.open();
  }

  /** Follow these projects' deployments (the open tabs). */
  setWatched(list: Watched[]) {
    const key = (l: Watched[]) => l.map((w) => w.projectId).sort().join(',');
    const changed = key(list) !== key(this.watched);
    this.watched = list;
    if (changed && this.token) void this.refresh();
  }

  async refresh() {
    if (!this.token || !this.watched.length) return;
    const results = await Promise.all(
      this.watched.map(async (w) => {
        try {
          return [w.projectId, await this.client(w.teamId).deployments(w.projectId)] as const;
        } catch (e) {
          this.update({ error: (e as Error).message });
          return [w.projectId, this.state.deployments[w.projectId] ?? []] as const;
        }
      }),
    );
    const deployments: Record<string, VercelDeployment[]> = {};
    for (const [id, list] of results) deployments[id] = list;
    this.update({ deployments, syncedAt: Date.now() });
  }

  private startPolling() {
    this.stop();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Create a "Protection Bypass for Automation" secret on a project (explicit user action). */
  async generateBypass(projectId: string) {
    const current = this.state.projects.find((p) => p.id === projectId);
    if (!current) return;
    const project = await this.client(current.teamId).generateBypass(projectId);
    this.update({ projects: this.state.projects.map((p) => (p.id === projectId ? { ...project, teamId: current.teamId } : p)) });
  }

  /** Bypass secret of the project that serves this URL (its domain or one of its deployments). */
  bypassSecretFor(url: string): string | null {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return null;
    }
    const hostOf = (u: string | null) => {
      try {
        return u ? new URL(u).host : null;
      } catch {
        return null;
      }
    };
    const owner =
      this.state.projects.find((p) => hostOf(p.productionUrl) === host) ??
      this.state.projects.find((p) => (this.state.deployments[p.id] ?? []).some((d) => hostOf(d.url) === host));
    if (owner) return owner.bypassSecrets[0] ?? null;
    // A deployment URL we do not know yet (new branch alias): try the projects open in tabs.
    // The caller only sends the secret to deployment hosts (*.vercel.app).
    const followed = this.watched.map((w) => this.state.projects.find((p) => p.id === w.projectId)).find((p) => p?.bypassSecrets.length);
    return followed?.bypassSecrets[0] ?? null;
  }
}
