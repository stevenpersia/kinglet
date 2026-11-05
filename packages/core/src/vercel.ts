/**
 * Minimal Vercel REST API client (personal access token).
 * Parsing is tolerant: fields Vercel may omit are optional, unknown ones are ignored.
 */

import { t } from './i18n.ts';

export const VERCEL_API = 'https://api.vercel.com';

export type DeploymentState = 'READY' | 'BUILDING' | 'QUEUED' | 'INITIALIZING' | 'ERROR' | 'CANCELED';

export interface VercelUser {
  id: string;
  username: string;
  name: string | null;
}

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  repo: string | null;
  /** https:// URL of the production domain, when Vercel reports one. */
  productionUrl: string | null;
  /** Deployment the production domain serves now (Vercel's targets.production), when reported. */
  productionDeploymentId?: string | null;
  /** "Protection Bypass for Automation" secrets defined on the project. */
  bypassSecrets: string[];
}

export interface VercelDeployment {
  id: string;
  /** Full URL (https://…). */
  url: string;
  state: DeploymentState;
  production: boolean;
  createdAt: number;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  author: string | null;
  inspectorUrl: string | null;
}

export class VercelError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Vercel returns bare hostnames; tests (and some fields) may already carry a scheme. */
const withScheme = (u: string) => (/^https?:\/\//.test(u) ? u.replace(/\/$/, '') : `https://${u.replace(/\/$/, '')}`);

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function parseProject(p: Json): VercelProject {
  const link = (p.link ?? {}) as Json;
  const targets = (p.targets ?? {}) as Json;
  const production = (targets.production ?? {}) as Json;
  const aliases = Array.isArray(production.alias) ? (production.alias as string[]) : Array.isArray(p.alias) ? (p.alias as Json[]).map((a) => String(a.domain ?? '')) : [];
  // Prefer a custom domain over the *.vercel.app one.
  const domain = aliases.find((a) => a && !a.endsWith('.vercel.app')) ?? aliases.find(Boolean) ?? null;
  const repo = str(link.repo) ? (str(link.org) ? `${link.org}/${link.repo}` : String(link.repo)) : str(link.projectName);
  return {
    id: String(p.id),
    name: String(p.name),
    framework: str(p.framework),
    repo,
    productionUrl: domain ? withScheme(domain) : null,
    productionDeploymentId: str(production.id),
    bypassSecrets: Object.entries((p.protectionBypass ?? {}) as Record<string, Json>)
      .filter(([, v]) => v?.scope === 'automation-bypass')
      .map(([k]) => k),
  };
}

export function parseDeployment(d: Json): VercelDeployment {
  const meta = (d.meta ?? {}) as Json;
  const pick = (k: string) => str(meta[`github${k}`]) ?? str(meta[`gitlab${k}`]) ?? str(meta[`bitbucket${k}`]);
  const state = String(d.state ?? d.readyState ?? 'QUEUED').toUpperCase() as DeploymentState;
  return {
    id: String(d.uid ?? d.id),
    url: withScheme(String(d.url)),
    state,
    production: d.target === 'production',
    createdAt: Number(d.createdAt ?? d.created ?? 0),
    branch: pick('CommitRef'),
    commitSha: pick('CommitSha'),
    commitMessage: pick('CommitMessage')?.split('\n')[0] ?? null,
    author: pick('CommitAuthorLogin') ?? pick('CommitAuthorName') ?? str((d.creator as Json | undefined)?.username),
    inspectorUrl: str(d.inspectorUrl),
  };
}

export class VercelClient {
  private token: string;
  private teamId: string | null;
  private base: string;
  private fetchImpl: typeof fetch;

  constructor(opts: { token: string; teamId?: string | null; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.token = opts.token;
    this.teamId = opts.teamId ?? null;
    this.base = (opts.baseUrl ?? VERCEL_API).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async req<T>(method: 'GET' | 'PATCH', path: string, query: Record<string, string | number | undefined> = {}, body?: unknown): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries({ ...query, teamId: this.teamId ?? undefined })) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const err = (json.error ?? {}) as Json;
      const message = res.status === 401 || res.status === 403 ? t('Vercel token rejected (invalid, expired or without access to this team).', 'Jeton Vercel refusé (invalide, expiré ou sans accès à cette équipe).') : String(err.message ?? `HTTP ${res.status}`);
      throw new VercelError(res.status, message);
    }
    return json as T;
  }

  async user(): Promise<VercelUser> {
    const { user } = await this.req<{ user: Json }>('GET', '/v2/user');
    return { id: String(user.id ?? user.uid), username: String(user.username), name: str(user.name) };
  }

  async teams(): Promise<VercelTeam[]> {
    const { teams } = await this.req<{ teams: Json[] }>('GET', '/v2/teams', { limit: 50 });
    return (teams ?? []).map((team) => ({ id: String(team.id), slug: String(team.slug), name: String(team.name ?? team.slug) }));
  }

  async projects(): Promise<VercelProject[]> {
    const { projects } = await this.req<{ projects: Json[] }>('GET', '/v9/projects', { limit: 100 });
    return (projects ?? []).map(parseProject).sort((a, b) => a.name.localeCompare(b.name));
  }

  async project(idOrName: string): Promise<VercelProject> {
    return parseProject(await this.req<Json>('GET', `/v9/projects/${encodeURIComponent(idOrName)}`));
  }

  async deployments(projectId: string, limit = 30): Promise<VercelDeployment[]> {
    const { deployments } = await this.req<{ deployments: Json[] }>('GET', '/v6/deployments', { projectId, limit });
    return (deployments ?? []).map(parseDeployment).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Create a "Protection Bypass for Automation" secret on the project (changes the project:
   * only on an explicit user action). Returns the project as it is afterwards.
   */
  async generateBypass(projectId: string): Promise<VercelProject> {
    await this.req('PATCH', `/v1/projects/${encodeURIComponent(projectId)}/protection-bypass`, {}, { generate: { note: 'Kinglet' } });
    return this.project(projectId);
  }
}

/** Latest ready preview per branch, newest first. */
export function previewsByBranch(deployments: VercelDeployment[]): VercelDeployment[] {
  const seen = new Set<string>();
  return deployments.filter((d) => {
    if (d.production || d.state !== 'READY') return false;
    const key = d.branch ?? d.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The same page on another environment: keep path, query and hash, change the origin. */
export function samePageOn(currentUrl: string | null, targetOrigin: string): string {
  const target = new URL(targetOrigin);
  if (!currentUrl) return target.toString();
  try {
    const cur = new URL(currentUrl);
    return new URL(cur.pathname + cur.search + cur.hash, target.origin).toString();
  } catch {
    return target.toString();
  }
}

/**
 * Headers for Vercel Deployment Protection ("Protection Bypass for Automation").
 * `x-vercel-set-bypass-cookie` asks Vercel to answer with a redirect that sets a cookie: right for a
 * browser (the devices), but a redirect loop for a client without cookies (the bots Kinglet imitates).
 */
export function vercelBypassHeaders(url: string, opts: { secret: string | null | undefined; hosts?: string[]; browser?: boolean }): Record<string, string> {
  if (!opts.secret) return {};
  const hosts = opts.hosts ?? ['*.vercel.app'];
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return {};
  }
  if (!hosts.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p))) return {};
  return opts.browser ? { 'x-vercel-protection-bypass': opts.secret, 'x-vercel-set-bypass-cookie': 'true' } : { 'x-vercel-protection-bypass': opts.secret };
}
