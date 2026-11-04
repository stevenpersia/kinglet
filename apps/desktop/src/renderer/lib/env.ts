import { previewsByBranch, t as tr, samePageOn, type VercelDeployment } from '@parakeet/core';
import type { EnvId, VercelTeamProject } from '../../shared/types';

/** The Vercel side of one project: the project and its deployments. */
export interface ProjectVercel {
  project: VercelTeamProject | null;
  deployments: VercelDeployment[];
}

export const isLocal = (u: string) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(u);

const originOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};

/** Which environment a URL belongs to (null: some other site). */
export function envOf(url: string | null, vercel: ProjectVercel | null): EnvId | null {
  if (!url) return null;
  const origin = originOf(url);
  // Known deployments first: a deployment may be served from a local address (tests, tunnels).
  if (vercel?.project?.productionUrl && origin === originOf(vercel.project.productionUrl)) return 'prod';
  const dep = vercel?.deployments.find((d) => originOf(d.url) === origin);
  if (dep) return dep.production ? 'prod' : 'preview';
  if (isLocal(url)) return 'local';
  if (origin?.endsWith('.vercel.app')) return 'preview';
  return null;
}

export interface EnvTargets {
  local: string | null;
  preview: VercelDeployment | null;
  previews: VercelDeployment[];
  /** Production domain (or the live deployment's URL). */
  prod: string | null;
  /** Production deployments, newest first (ready or failed). */
  prods: VercelDeployment[];
  /** The deployment production serves now. */
  liveProd: VercelDeployment | null;
  /** An older production deployment chosen in the menu (null: the live one). */
  oldProd: VercelDeployment | null;
}

/** Production deployments, newest first, and the one the domain serves now. */
export function productionsOf(vercel: ProjectVercel | null): { prods: VercelDeployment[]; live: VercelDeployment | null } {
  const prods = (vercel?.deployments ?? []).filter((d) => d.production && (d.state === 'READY' || d.state === 'ERROR')).sort((a, b) => b.createdAt - a.createdAt);
  const id = vercel?.project?.productionDeploymentId;
  const live = (id ? prods.find((d) => d.id === id) : null) ?? prods.find((d) => d.state === 'READY') ?? null;
  return { prods, live };
}

/** The older production deployment a URL is on (null: live prod, or not production at all). */
export function oldProdOf(url: string | null, vercel: ProjectVercel | null): VercelDeployment | null {
  const origin = originOf(url);
  if (!origin || !vercel) return null;
  if (vercel.project?.productionUrl && origin === originOf(vercel.project.productionUrl)) return null;
  const { prods, live } = productionsOf(vercel);
  const dep = prods.find((d) => originOf(d.url) === origin);
  return dep && dep.id !== live?.id && originOf(live?.url) !== origin ? dep : null;
}

/**
 * Where each environment is: the local dev server (remembered), the chosen preview
 * (default: the latest ready one), production (project domain, else the live production deployment;
 * or an older production deployment chosen in the menu).
 */
export function envTargets(localOrigin: string | null, vercel: ProjectVercel | null, previewId: string | null, prodId: string | null = null): EnvTargets {
  const previews = vercel ? previewsByBranch(vercel.deployments) : [];
  const preview = previews.find((d) => d.id === previewId) ?? previews[0] ?? null;
  const { prods, live } = productionsOf(vercel);
  const chosen = prodId ? prods.find((d) => d.id === prodId && d.state === 'READY') : null;
  const oldProd = chosen && chosen.id !== live?.id ? chosen : null;
  return {
    local: localOrigin,
    preview,
    previews,
    prod: oldProd?.url ?? vercel?.project?.productionUrl ?? live?.url ?? null,
    prods,
    liveProd: live,
    oldProd,
  };
}

/** The current page on another environment (same path). */
export function urlOnEnv(current: string | null, env: EnvId, t: EnvTargets): string | null {
  const origin = env === 'local' ? t.local : env === 'preview' ? (t.preview?.url ?? null) : t.prod;
  return origin ? samePageOn(current, origin) : null;
}

export const ENV_LABEL: Record<EnvId, string> = { local: 'Local', preview: 'Preview', prod: 'Prod' };
export const ENV_DOT: Record<EnvId, string> = { local: 'bg-local', preview: 'bg-preview', prod: 'bg-prod' };

export function timeAgo(t: number, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - t) / 60_000));
  if (m < 1) return tr('just now', 'à l’instant');
  if (m < 60) return tr(`${m} min ago`, `il y a ${m} min`);
  if (m < 1440) return tr(`${Math.round(m / 60)} h ago`, `il y a ${Math.round(m / 60)} h`);
  return tr(`${Math.round(m / 1440)} d ago`, `il y a ${Math.round(m / 1440)} j`);
}
