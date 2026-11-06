import { t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { LocalServer } from '../../shared/types';
import { api, useStore } from '../store';
import { Icon, Kbd, KingletBird } from './Icons';

const tilde = (p: string) => p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');

/** No site open yet: what Kinglet does, and the ways to open a first site. */
export function Welcome() {
  const s = useStore();
  const [servers, setServers] = useState<LocalServer[] | null>(null);

  // Native device views stay hidden while there is nothing to show.
  useEffect(() => {
    api().setPreviewsVisible(false);
    return () => api().setPreviewsVisible(useStore.getState().section === 'apercu');
  }, []);
  // A dev server started now shows up here within a few seconds.
  useEffect(() => {
    let live = true;
    const look = async () => {
      const found = await api().localServers();
      if (live) setServers(found);
    };
    void look();
    const timer = setInterval(look, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const card = 'flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4 text-left';
  return (
    <main className="stage-bg flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-[720px] flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <KingletBird width={112} />
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">{t('Open your first site', 'Ouvre ton premier site')}</h1>
          <p className="m-0 text-muted">{t('Kinglet shows it on all your devices, locally, in preview and in production.', 'Kinglet l’affichera sur tous tes appareils, en local, en preview et en prod.')}</p>
        </div>
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
          <div className={card}>
            <span className="font-medium">{t('New project', 'Nouveau projet')}</span>
            <span className="text-xs leading-relaxed text-muted">{t('From scratch, with Claude: choose the stack together, see the site here, then publish it on GitHub and Vercel.', 'De zéro, avec Claude : choisissez la stack ensemble, vois le site ici, puis publie-le sur GitHub et Vercel.')}</span>
            <span className="mt-auto pt-1">
              <button onClick={() => useStore.setState({ newProject: 'create' })} className="flex h-7 items-center rounded-ui bg-fg px-2.5 text-xs font-semibold text-bg">
                {t('Create a project', 'Créer un projet')}
              </button>
            </span>
          </div>
          <div className={card}>
            <span className="font-medium">{t('Local server', 'Serveur local')}</span>
            {servers?.length ? (
              <div className="flex flex-col gap-1">
                {servers.map((sv) => (
                  <button key={sv.url} onClick={() => void s.openAddress(sv.url)} className="flex flex-col rounded-md border border-line bg-bg px-2.5 py-1.5 text-left hover:border-line-strong">
                    <span className="flex items-center gap-2 font-mono text-xs text-fg">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-local" />
                      localhost:{sv.port}
                    </span>
                    {sv.folder && <span className="truncate font-mono text-[10.5px] text-faint">{tilde(sv.folder)}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs leading-relaxed text-muted">
                {t('Start your dev server (npm run dev): it shows up here. Or type its port at the top.', 'Lance ton serveur de dev (npm run dev) : il apparaît ici. Ou tape son port en haut.')}
              </span>
            )}
            <span className="mt-auto pt-1">
              <Kbd>Ctrl L</Kbd>
            </span>
          </div>
          <div className={card}>
            <span className="font-medium">{t('Vercel project', 'Projet Vercel')}</span>
            <span className="text-xs leading-relaxed text-muted">{t('All the projects of your account and teams, with their previews and production.', 'Tous les projets de ton compte et de tes équipes, avec leurs previews et leur prod.')}</span>
            <span className="mt-auto pt-1">
              {s.vercel?.connected ? (
                <button onClick={() => useStore.setState({ switcherOpen: true })} className="flex h-7 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium hover:border-line-strong">
                  {t('Choose a project', 'Choisir un projet')} <Kbd>Ctrl P</Kbd>
                </button>
              ) : (
                <button onClick={() => s.openSettings('vercel')} className="flex h-7 items-center rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium hover:border-line-strong">
                  {t('Connect Vercel', 'Connecter Vercel')}
                </button>
              )}
            </span>
          </div>
          <div className={card}>
            <span className="flex items-center gap-2 font-medium">
              <Icon name="spark" size={13} className="text-[#d97757]" />
              {t('Guided setup', 'Accueil guidé')}
            </span>
            <span className="text-xs leading-relaxed text-muted">{t('Accounts, first project and Claude, in a minute.', 'Comptes, premier projet et Claude, en une minute.')}</span>
            <span className="mt-auto pt-1">
              <button onClick={() => void s.updateSettings({ onboarded: false })} className="flex h-7 items-center rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium hover:border-line-strong">
                {t('Start', 'Commencer')}
              </button>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
