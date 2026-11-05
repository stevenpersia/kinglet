import { t as tr, type VercelDeployment } from '@kinglet/core';
import { useState } from 'react';
import type { EnvId } from '../../shared/types';
import { ENV_DOT, ENV_LABEL, envOf, envTargets, oldProdOf, productionsOf, timeAgo } from '../lib/env';
import { activeProject } from '../../shared/projects';
import { projectVercel, useStore } from '../store';
import { Dot, Icon } from './Icons';
import { PrBadge, usePullRequests } from './PullRequest';

const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).host : '';
  } catch {
    return u ?? '';
  }
};
const sha = (d: VercelDeployment) => d.commitSha?.slice(0, 7) ?? d.id.replace(/^dpl_/, '').slice(0, 7);

/** Local / Preview / Prod: the same page on each environment. */
export function EnvSwitch() {
  const s = useStore();
  const { url, previewId, prodId, switchEnv, openOverlay, closeOverlay } = s;
  const vercel = projectVercel(s);
  const [menu, setMenu] = useState<'preview' | 'prod' | null>(null);
  const prs = usePullRequests();
  const current = envOf(url, vercel);
  const t = envTargets(activeProject(s.settings)?.localOrigin ?? null, vercel, previewId, prodId);
  const old = current === 'prod' ? oldProdOf(url, vercel) : null;
  const linked = !!vercel.project;

  const why: Record<EnvId, string | null> = {
    local: t.local ? null : tr('No local server open yet', 'Aucun serveur local ouvert pour l’instant'),
    preview: !linked ? tr('Link this project to Vercel in settings', 'Relie ce projet à Vercel dans les réglages') : t.preview ? null : tr('No preview ready', 'Aucune preview prête'),
    prod: !linked ? tr('Link this project to Vercel in settings', 'Relie ce projet à Vercel dans les réglages') : t.prod ? null : tr('No production deployment', 'Pas de déploiement de production'),
  };

  const toggleMenu = async (which: 'preview' | 'prod') => {
    if (menu) {
      setMenu(null);
      closeOverlay();
    } else {
      await openOverlay();
      setMenu(which);
    }
  };
  const close = () => {
    setMenu(null);
    closeOverlay();
  };
  const pickPreview = (id: string) => {
    close();
    void switchEnv('preview', id);
  };
  const pickProd = (d: VercelDeployment | null) => {
    close();
    void switchEnv('prod', d && d.id !== t.liveProd?.id ? d.id : null);
  };

  const button = (env: EnvId) => {
    const on = current === env;
    const disabled = !!why[env] && !on;
    const isOld = env === 'prod' && on && !!old;
    return (
      <button
        key={env}
        aria-pressed={on}
        disabled={disabled}
        // Prod always means the live production, even when an older one is shown.
        onClick={() => (disabled ? undefined : on && !isOld ? undefined : void switchEnv(env, env === 'prod' ? null : undefined))}
        title={
          why[env] ??
          (env === 'preview' && t.preview
            ? `${t.preview.branch ?? 'preview'} · ${t.preview.url}`
            : env === 'prod'
              ? isOld
                ? tr('Older production · click to go back to the live one', 'Ancienne prod · clique pour revenir à la prod actuelle')
                : (vercel.project?.productionUrl ?? t.liveProd?.url ?? '')
              : (t.local ?? ''))
        }
        className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap ${
          isOld
            ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_rgba(230,192,123,0.45)]'
            : on
              ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]'
              : disabled
                ? 'cursor-default text-ghost'
                : 'text-faint hover:text-fg'
        }`}
      >
        <Dot className={isOld ? 'bg-warn' : ENV_DOT[env]} />
        {ENV_LABEL[env]}
        {env === 'preview' && on && t.preview?.branch && <span className="hidden max-w-28 truncate font-mono text-[10.5px] text-muted 2xl:inline">{t.preview.branch}</span>}
        {isOld && <span className="font-mono text-[10.5px] text-warn">· {timeAgo(old.createdAt)}</span>}
      </button>
    );
  };

  const chevron = (which: 'preview' | 'prod', label: string) => (
    <button
      onClick={() => void toggleMenu(which)}
      aria-label={label}
      aria-expanded={menu === which}
      className={`flex h-6 w-5 items-center justify-center rounded-md ${menu === which ? 'bg-active text-fg' : 'text-faint hover:text-fg'}`}
    >
      <Icon name="chevrons" size={10} />
    </button>
  );

  const shownProdId = old?.id ?? t.liveProd?.id;
  const others = t.prods.filter((d) => d.id !== t.liveProd?.id).slice(0, 8);

  return (
    <div className="no-drag relative shrink-0">
      <div role="group" aria-label={tr('Environment', 'Environnement')} className="flex gap-0.5 rounded-lg border border-line bg-bg p-0.5">
        {button('local')}
        {button('preview')}
        {linked && t.previews.length > 0 && chevron('preview', tr('Choose the preview', 'Choisir la preview'))}
        {button('prod')}
        {linked && t.prods.length > 1 && chevron('prod', tr('Choose the production deployment', 'Choisir le déploiement de production'))}
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          {menu === 'preview' ? (
            <div role="menu" className="absolute top-9 left-0 z-50 w-[380px] rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
              <div className="label px-2.5 pt-2 pb-1.5">{tr('Ready previews, by branch', 'Previews prêtes, par branche')}</div>
              {t.previews.map((d) => (
                <button key={d.id} role="menuitem" onClick={() => pickPreview(d.id)} className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-active ${d.id === t.preview?.id ? 'bg-active' : ''}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-xs text-fg">{d.branch ?? d.id}</span>
                      {d.branch && prs[d.branch] && <PrBadge pr={prs[d.branch]!} />}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{timeAgo(d.createdAt)}</span>
                  </span>
                  <span className="truncate text-xs text-muted">{(d.branch && prs[d.branch]?.title) || d.commitMessage || d.url}</span>
                </button>
              ))}
            </div>
          ) : (
            <div role="menu" aria-label={tr('Production deployments', 'Déploiements de production')} className="absolute top-9 left-0 z-50 w-[420px] rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
              <div className="label px-2.5 pt-2 pb-1.5">{tr('Live production', 'Production actuelle')}</div>
              {t.liveProd && (
                <button
                  role="menuitem"
                  onClick={() => pickProd(null)}
                  aria-current={shownProdId === t.liveProd.id && current === 'prod' ? 'true' : undefined}
                  className="mb-1 flex w-full flex-col gap-1 rounded-md bg-[rgba(125,211,168,0.07)] px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(125,211,168,0.3)] hover:bg-[rgba(125,211,168,0.11)]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot className="bg-prod" />
                      <span className="truncate font-mono text-[13px] font-medium text-fg">{host(vercel.project?.productionUrl ?? t.liveProd.url)}</span>
                      <span className="shrink-0 rounded-full bg-[rgba(125,211,168,0.16)] px-1.5 py-px text-[10px] font-medium tracking-[0.04em] text-prod uppercase">{tr('Live', 'En ligne')}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{timeAgo(t.liveProd.createdAt)}</span>
                  </span>
                  <span className="truncate text-xs text-muted">
                    <span className="font-mono text-faint">
                      {t.liveProd.branch ?? 'main'} · {sha(t.liveProd)}
                    </span>
                    {t.liveProd.commitMessage ? ` · ${t.liveProd.commitMessage.split('\n')[0]}` : ''}
                  </span>
                </button>
              )}
              {others.length > 0 && (
                <>
                  <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1.5">
                    <span className="label">{tr('Earlier productions', 'Prods précédentes')}</span>
                  </div>
                  {others.map((d) => {
                    const failed = d.state !== 'READY';
                    return (
                      <button
                        key={d.id}
                        role="menuitem"
                        disabled={failed}
                        onClick={() => pickProd(d)}
                        aria-current={shownProdId === d.id && current === 'prod' ? 'true' : undefined}
                        className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left ${failed ? 'cursor-default' : 'hover:bg-active'} ${shownProdId === d.id && current === 'prod' ? 'bg-active' : ''}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <Dot className={failed ? 'bg-err' : 'bg-ghost'} />
                            <span className={`truncate font-mono text-xs ${failed ? 'text-muted' : 'text-fg'}`}>
                              {d.branch ?? 'main'} · {sha(d)}
                            </span>
                            {failed && <span className="shrink-0 rounded-full bg-raised px-1.5 py-px text-[10px] font-medium tracking-[0.04em] text-muted uppercase">{tr('Failed', 'Échec')}</span>}
                          </span>
                          <span className="shrink-0 text-[11px] text-faint">{timeAgo(d.createdAt)}</span>
                        </span>
                        <span className="truncate text-xs text-muted">{failed ? tr('Build failed, never served', 'Build cassé, jamais mis en ligne') : (d.commitMessage?.split('\n')[0] ?? d.url)}</span>
                      </button>
                    );
                  })}
                </>
              )}
              <div className="mx-1.5 my-1 h-px bg-line-soft" />
              <p className="m-0 px-2.5 pt-1 pb-2 text-[11px] leading-normal text-faint">
                {tr('An earlier production opens on its own Vercel address. It changes nothing for your visitors.', 'Une ancienne prod s’ouvre sur son adresse fixe chez Vercel. Elle ne change rien à ce qui est en ligne.')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Shown above the devices when an older production deployment is open, not the live one. */
export function OldProdBanner() {
  const s = useStore();
  const vercel = projectVercel(s);
  const old = oldProdOf(s.url, vercel);
  if (!old) return null;
  const domain = host(vercel.project?.productionUrl ?? productionsOf(vercel).live?.url);
  return (
    <div role="status" className="mx-4 mt-3 flex items-center gap-2.5 rounded-lg border border-[rgba(230,192,123,0.3)] bg-[rgba(230,192,123,0.06)] px-3 py-2 text-[12.5px]">
      <Dot className="bg-warn" />
      <span className="min-w-0 flex-1 text-muted">
        <span className="font-medium text-fg">{tr('Earlier production', 'Ancienne prod')}</span> · <span className="font-mono">{sha(old)}</span>,{' '}
        {tr(`deployed ${timeAgo(old.createdAt)}.`, `mise en ligne ${timeAgo(old.createdAt)}.`)}{' '}
        {domain ? tr(`This is not what visitors see on ${domain}.`, `Ce n’est pas ce que voient tes visiteurs sur ${domain}.`) : ''}
      </span>
      <button onClick={() => void s.switchEnv('prod', null)} className="flex h-7 shrink-0 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-fg hover:border-line-strong">
        {tr('Back to the live production', 'Revenir à la prod actuelle')}
      </button>
    </div>
  );
}
