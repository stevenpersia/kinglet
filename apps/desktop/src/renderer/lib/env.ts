import { previewsByBranch, samePageOn, type VercelDeployment } from '@parakeet/core';
import type { EnvId, VercelState } from '../../shared/types';

export const isLocal = (u: string) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(u);

const originOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};

/** Which environment a URL belongs to (null: some other site). */
export function envOf(url: string | null, vercel: Pick<VercelState, 'project' | 'deployments'> | null): EnvId | null {
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
  prod: string | null;
}

/**
 * Where each environment is: the local dev server (remembered), the chosen preview
 * (default: the latest ready one), production (project domain, else the latest production deployment).
 */
export function envTargets(localOrigin: string | null, vercel: Pick<VercelState, 'project' | 'deployments'> | null, previewId: string | null): EnvTargets {
  const previews = vercel ? previewsByBranch(vercel.deployments) : [];
  const preview = previews.find((d) => d.id === previewId) ?? previews[0] ?? null;
  const prodDeployment = vercel?.deployments.find((d) => d.production && d.state === 'READY');
  return {
    local: localOrigin,
    preview,
    previews,
    prod: vercel?.project?.productionUrl ?? prodDeployment?.url ?? null,
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
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}
