import { t as tr } from '@parakeet/core';
import { useState } from 'react';
import type { EnvId } from '../../shared/types';
import { ENV_DOT, ENV_LABEL, envOf, envTargets, timeAgo } from '../lib/env';
import { activeProject } from '../../shared/projects';
import { projectVercel, useStore } from '../store';
import { Dot, Icon } from './Icons';

/** Local / Preview / Prod: the same page on each environment. */
export function EnvSwitch() {
  const s = useStore();
  const { url, previewId, switchEnv, openOverlay, closeOverlay } = s;
  const vercel = projectVercel(s);
  const [menu, setMenu] = useState(false);
  const current = envOf(url, vercel);
  const t = envTargets(activeProject(s.settings)?.localOrigin ?? null, vercel, previewId);
  const linked = !!vercel.project;

  const why: Record<EnvId, string | null> = {
    local: t.local ? null : tr('No local server open yet', 'Aucun serveur local ouvert pour l’instant'),
    preview: !linked ? tr('Link this project to Vercel in settings', 'Relie ce projet à Vercel dans les réglages') : t.preview ? null : tr('No preview ready', 'Aucune preview prête'),
    prod: !linked ? tr('Link this project to Vercel in settings', 'Relie ce projet à Vercel dans les réglages') : t.prod ? null : tr('No production deployment', 'Pas de déploiement de production'),
  };

  const toggleMenu = async () => {
    if (menu) {
      setMenu(false);
      closeOverlay();
    } else {
      await openOverlay();
      setMenu(true);
    }
  };
  const pick = (id: string) => {
    setMenu(false);
    closeOverlay();
    void switchEnv('preview', id);
  };

  const button = (env: EnvId) => {
    const on = current === env;
    const disabled = !!why[env] && !on;
    return (
      <button
        key={env}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => (disabled ? undefined : on ? undefined : void switchEnv(env))}
        title={why[env] ?? (env === 'preview' && t.preview ? `${t.preview.branch ?? 'preview'} · ${t.preview.url}` : env === 'prod' ? (t.prod ?? '') : (t.local ?? ''))}
        className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : disabled ? 'cursor-default text-ghost' : 'text-faint hover:text-fg'}`}
      >
        <Dot className={ENV_DOT[env]} />
        {ENV_LABEL[env]}
        {env === 'preview' && on && t.preview?.branch && <span className="hidden max-w-28 truncate font-mono text-[10.5px] text-muted 2xl:inline">{t.preview.branch}</span>}
      </button>
    );
  };

  return (
    <div className="no-drag relative shrink-0">
      <div role="group" aria-label={tr('Environment', 'Environnement')} className="flex gap-0.5 rounded-lg border border-line bg-bg p-0.5">
        {button('local')}
        {button('preview')}
        {linked && t.previews.length > 0 && (
          <button onClick={toggleMenu} aria-label={tr('Choose the preview', 'Choisir la preview')} aria-expanded={menu} className="flex h-6 w-5 items-center justify-center rounded-md text-faint hover:text-fg">
            <Icon name="chevrons" size={10} />
          </button>
        )}
        {button('prod')}
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggleMenu} />
          <div role="menu" className="absolute top-9 left-0 z-50 w-[380px] rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <div className="label px-2.5 pt-2 pb-1.5">{tr('Ready previews, by branch', 'Previews prêtes, par branche')}</div>
            {t.previews.map((d) => (
              <button key={d.id} role="menuitem" onClick={() => pick(d.id)} className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-active ${d.id === t.preview?.id ? 'bg-active' : ''}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-fg">{d.branch ?? d.id}</span>
                  <span className="shrink-0 text-[11px] text-faint">{timeAgo(d.createdAt)}</span>
                </span>
                <span className="truncate text-xs text-muted">{d.commitMessage ?? d.url}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
