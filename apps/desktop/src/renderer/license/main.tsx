import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../app.css';
import { setLanguage, t } from '@kinglet/core';
import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { LicenseApi } from '../../preload/license';
import type { LicenseState } from '../../shared/types';
import { Icon, Mark } from '../components/Icons';

declare global {
  interface Window {
    kingletLicense: LicenseApi;
  }
}
const api = () => window.kingletLicense;

/** Why the window is open, above the field. */
function reason(s: LicenseState) {
  if (s.status === 'invalid') return t('Your license is no longer valid on this computer.', 'Ta licence n’est plus valide sur cet ordinateur.');
  if (s.status === 'expired') return t('Kinglet needs to check your license.', 'Kinglet doit vérifier ta licence.');
  if (s.status === 'unconfigured') return t('Licenses can’t be checked in this build.', 'Les licences ne peuvent pas être vérifiées dans cette version.');
  return t('Enter the license key from your purchase email to start using Kinglet.', 'Saisis la clé de licence reçue dans ton e-mail d’achat pour utiliser Kinglet.');
}

function License() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<LicenseState | null>(null);
  const [version, setVersion] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api()
      .init()
      .then((r) => {
        setLanguage(r.lang);
        document.documentElement.lang = r.lang;
        setState(r.state);
        setVersion(r.version);
        setReady(true);
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const next = await api().activate(key);
    setState(next);
    setBusy(false);
  }

  if (!ready || !state) return null;
  const done = state.status === 'active';
  return (
    <main className="relative flex h-full flex-col items-center justify-center gap-7 px-10 select-none">
      <div className="flex flex-col items-center gap-3 text-center">
        <Mark size={44} />
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">{done ? t('Kinglet is activated', 'Kinglet est activé') : t('Activate Kinglet', 'Activer Kinglet')}</h1>
        <p className="m-0 max-w-[380px] text-[13.5px] leading-relaxed text-muted">
          {done ? t(`Thanks${state.customer ? `, ${state.customer.split(' ')[0]}` : ''}! Opening Kinglet…`, `Merci${state.customer ? ` ${state.customer.split(' ')[0]}` : ''} ! Ouverture de Kinglet…`) : reason(state)}
        </p>
      </div>

      {done ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-[rgba(125,211,168,0.14)] text-ok">
          <Icon name="check" size={20} />
        </span>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-2.5">
          <label htmlFor="key" className="label">
            {t('License key', 'Clé de licence')}
          </label>
          <input
            id="key"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="KINGLET_XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            aria-invalid={!!state.error}
            aria-describedby={state.error ? 'error' : undefined}
            className="h-10 rounded-ui border border-line bg-card px-3 font-mono text-[12.5px] text-fg outline-none placeholder:text-ghost focus:border-line-strong"
          />
          {state.error && (
            <p id="error" role="alert" className="m-0 text-xs leading-normal text-err">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={busy || !key.trim() || state.status === 'unconfigured'} className="mt-1 h-10 rounded-ui bg-fg font-semibold text-bg disabled:opacity-50">
            {busy ? t('Checking…', 'Vérification…') : t('Activate', 'Activer')}
          </button>
          <p className="m-0 text-center text-xs text-faint">{t('Activating needs the internet once. Kinglet then works offline for up to 14 days at a time.', 'L’activation demande internet une fois. Kinglet marche ensuite hors ligne jusqu’à 14 jours d’affilée.')}</p>
          <p className="m-0 text-center text-xs text-ghost">{t('Activating means you accept the license terms.', 'Activer, c’est accepter les conditions de licence.')}</p>
        </form>
      )}

      {!done && (
        <div className="flex flex-col items-center gap-2 border-t border-line-soft pt-5 text-[13px]">
          <span className="text-muted">
            {t('No license yet?', 'Pas encore de licence ?')}{' '}
            <button onClick={() => api().open('buy')} className="font-medium text-fg underline-offset-2 hover:underline">
              {t('Buy Kinglet', 'Acheter Kinglet')}
            </button>
          </span>
          <button onClick={() => api().open('orders')} className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline">
            {t('Lost your key? Find it in Polar’s customer portal', 'Clé perdue ? Retrouve-la dans l’espace client Polar')}
          </button>
        </div>
      )}
      <span className="absolute bottom-3 flex items-center gap-3 font-mono text-[10px] text-ghost">
        Kinglet {version}
        <button onClick={() => api().open('terms')} className="underline-offset-2 hover:text-muted hover:underline">
          {t('Terms', 'Conditions')}
        </button>
        <button onClick={() => api().open('privacy')} className="underline-offset-2 hover:text-muted hover:underline">
          {t('Privacy', 'Confidentialité')}
        </button>
      </span>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <License />
  </StrictMode>,
);
