import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, useStore } from '../store';
import { ENV_DOT, envOf } from '../lib/env';
import { EnvSwitch } from './EnvSwitch';
import { Dot, Icon, Kbd, Mark } from './Icons';

const STATUS_LABEL = { idle: '', loading: 'chargement…', loaded: 'chargé', failed: 'injoignable' } as const;

function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\d+$/.test(v)) return `http://localhost:${v}/`; // "3000" → localhost:3000
  return (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(v) ? 'http://' : 'https://') + v;
}

function RecentMenu() {
  const { settings, navigate, openOverlay, closeOverlay } = useStore();
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (open) {
      setOpen(false);
      closeOverlay();
    } else {
      await openOverlay();
      setOpen(true);
    }
  };
  const pick = (url: string) => {
    setOpen(false);
    closeOverlay();
    void navigate(url);
  };
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };
  return (
    <div className="no-drag relative min-w-0 shrink">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        title={settings.url ? host(settings.url) : undefined}
        className="flex h-7 max-w-[120px] items-center gap-2 rounded-md px-2 text-[13px] font-medium whitespace-nowrap text-fg hover:bg-active lg:max-w-[180px] 2xl:max-w-[280px]"
      >
        <Icon name="globe" size={14} className="shrink-0 text-faint" />
        <span className="truncate">{settings.url ? host(settings.url) : 'Aucun site'}</span>
        <Icon name="chevrons" size={10} className="shrink-0 text-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div role="menu" className="absolute top-9 left-0 z-50 w-80 rounded-[10px] border border-line bg-card p-1 shadow-2xl shadow-black/60">
            <div className="label px-2.5 pt-2 pb-1.5">Récents</div>
            {settings.recentUrls.length === 0 && <div className="px-2.5 py-2 text-faint">Aucun site ouvert pour l’instant.</div>}
            {settings.recentUrls.map((u) => (
              <button key={u} role="menuitem" onClick={() => pick(u)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-active">
                <Dot className={u.includes('localhost') || u.includes('127.0.0.1') ? 'bg-local' : 'bg-faint'} />
                <span className="truncate font-mono text-xs">{u}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TitleBar() {
  const { url, status, detectedFrom, navigate, maximized, urlFocusTick, vercel, phone } = useStore();
  const env = envOf(url, vercel);
  const [draft, setDraft] = useState(url ?? '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(url ?? ''), [url]);
  useEffect(() => {
    if (urlFocusTick) input.current?.select();
  }, [urlFocusTick]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeUrl(draft);
    if (next) void navigate(next);
    input.current?.blur();
  };

  return (
    <header className="drag flex h-[46px] shrink-0 items-center gap-2 overflow-hidden border-b border-line-soft bg-chrome pl-3.5 xl:gap-3">
      <Mark />
      <span className="hidden text-sm font-semibold tracking-[-0.04em] whitespace-nowrap xl:inline">parakeet</span>
      <span className="hidden text-[#4a4a52] xl:inline">/</span>
      <RecentMenu />

      <EnvSwitch />

      <form onSubmit={submit} className="no-drag flex h-7 min-w-[150px] flex-1 items-center gap-2 rounded-ui border border-line bg-bg px-2.5 focus-within:border-line-strong">
        <Dot className={env ? ENV_DOT[env] : 'bg-ghost'} />
        <label htmlFor="url" className="sr-only">
          Adresse
        </label>
        <input
          id="url"
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          autoComplete="off"
          placeholder="localhost:3000, 5173 ou https://…"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none placeholder:text-ghost"
        />
        <span className="hidden text-[11.5px] whitespace-nowrap text-faint lg:inline">{status === 'loaded' && detectedFrom ? detectedFrom : STATUS_LABEL[status]}</span>
      </form>

      <button onClick={() => void api().reload()} aria-label="Recharger (Ctrl+R)" title="Recharger (Ctrl+R)" className="no-drag flex size-7 shrink-0 items-center justify-center rounded-ui border border-line text-muted hover:border-line-strong hover:text-fg">
        <Icon name="reload" size={13} />
      </button>
      <button
        onClick={() => useStore.setState({ phoneOpen: true })}
        title="Ouvrir cette page sur ton téléphone"
        aria-label="Sur mon téléphone"
        className="no-drag flex h-7 shrink-0 items-center gap-2 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-muted hover:border-line-strong hover:text-fg 2xl:px-2.5"
      >
        <Icon name="phone" size={13} />
        <span className="hidden 2xl:inline">Sur mon téléphone</span>
        {!!phone?.clients.length && <span className="size-1.5 rounded-full bg-ok" aria-label="téléphone connecté" />}
      </button>
      <button
        onClick={() => useStore.setState({ paletteOpen: true })}
        aria-label="Rechercher (Ctrl K)"
        title="Rechercher (Ctrl K)"
        className="no-drag flex h-7 shrink-0 items-center gap-2.5 rounded-ui border border-line px-2 text-xs whitespace-nowrap text-faint hover:border-line-strong 2xl:pr-2 2xl:pl-2.5"
      >
        <Icon name="search" size={13} className="2xl:hidden" />
        <span className="hidden 2xl:inline">Rechercher</span>
        <span className="hidden 2xl:inline">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>

      <div data-window-controls className="no-drag ml-1 flex h-full shrink-0">
        <button aria-label="Réduire" onClick={() => api().windowControl('minimize')} className="flex h-full w-[46px] items-center justify-center text-muted hover:bg-active hover:text-fg">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button aria-label={maximized ? 'Restaurer' : 'Agrandir'} onClick={() => api().windowControl('maximize')} className="flex h-full w-[46px] items-center justify-center text-muted hover:bg-active hover:text-fg">
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5h5.5V7M1.5 3h5.5v5.5H1.5z" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
          )}
        </button>
        <button aria-label="Fermer" onClick={() => api().windowControl('close')} className="flex h-full w-[46px] items-center justify-center text-muted hover:bg-[#c42b1c] hover:text-white">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
    </header>
  );
}
