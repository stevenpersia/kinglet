import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { VercelClient, type VercelDeployment } from '@parakeet/core';
import type { VercelState } from '../shared/types';

interface Stored {
  /** Token encrypted with safeStorage (base64), or in clear when no encryption is available. */
  token: string;
  encrypted: boolean;
  teamId: string | null;
  projectId: string | null;
}

const REFRESH_MS = 30_000;

/**
 * Vercel connection: personal token (encrypted with the system keyring through safeStorage),
 * linked project, deployments refreshed every 30 s.
 */
export class VercelService {
  private file: string;
  private stored: Stored | null = null;
  private client: VercelClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  state: VercelState = { connected: false, user: null, teams: [], teamId: null, projects: [], project: null, deployments: [], error: null, storage: 'none', syncedAt: null };

  constructor(
    userData: string,
    private emit: (s: VercelState) => void,
    private baseUrl = process.env.PARAKEET_VERCEL_API,
  ) {
    this.file = join(userData, 'vercel.json');
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

  private token(): string | null {
    if (!this.stored) return null;
    return this.stored.encrypted ? safeStorage.decryptString(Buffer.from(this.stored.token, 'base64')) : this.stored.token;
  }

  private update(patch: Partial<VercelState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  /** Restore the saved connection at startup. */
  async restore() {
    if (!existsSync(this.file)) return;
    try {
      this.stored = JSON.parse(readFileSync(this.file, 'utf8'));
      const token = this.token();
      if (!token) return;
      await this.open(token, this.stored!.teamId, this.stored!.projectId);
    } catch (e) {
      this.update({ error: `Connexion Vercel impossible : ${(e as Error).message}` });
    }
  }

  private async open(token: string, teamId: string | null, projectId: string | null) {
    this.client = new VercelClient({ token, teamId, baseUrl: this.baseUrl });
    const [user, teams, projects] = await Promise.all([this.client.user(), this.client.teams(), this.client.projects()]);
    const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
    this.update({ connected: true, user, teams, teamId, projects, project, error: null, storage: this.storageBackend() });
    this.startPolling();
  }

  async connect(token: string) {
    const clean = token.trim();
    const encrypted = safeStorage.isEncryptionAvailable();
    await this.open(clean, null, null); // throws on a refused token: nothing saved
    this.stored = { token: encrypted ? safeStorage.encryptString(clean).toString('base64') : clean, encrypted, teamId: null, projectId: null };
    this.save();
  }

  async selectTeam(teamId: string | null) {
    const token = this.token();
    if (!token || !this.stored) return;
    this.stored = { ...this.stored, teamId, projectId: null };
    this.save();
    this.update({ project: null, deployments: [] });
    await this.open(token, teamId, null);
  }

  async link(projectId: string | null) {
    if (!this.stored) return;
    this.stored = { ...this.stored, projectId };
    this.save();
    const project = projectId ? (this.state.projects.find((p) => p.id === projectId) ?? null) : null;
    this.update({ project, deployments: [] });
    await this.refresh();
  }

  async generateBypass() {
    if (!this.client || !this.state.project) return;
    const project = await this.client.generateBypass(this.state.project.id);
    this.update({ project, projects: this.state.projects.map((p) => (p.id === project.id ? project : p)) });
  }

  disconnect() {
    this.stop();
    this.stored = null;
    this.client = null;
    this.save();
    this.update({ connected: false, user: null, teams: [], teamId: null, projects: [], project: null, deployments: [], error: null, syncedAt: null });
  }

  async refresh() {
    if (!this.client || !this.state.project) return;
    try {
      const deployments: VercelDeployment[] = await this.client.deployments(this.state.project.id);
      this.update({ deployments, error: null, syncedAt: Date.now() });
    } catch (e) {
      this.update({ error: (e as Error).message });
    }
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

  /** Bypass secret of the linked project, if it has one. */
  get bypassSecret(): string | null {
    return this.state.project?.bypassSecrets[0] ?? null;
  }
}
