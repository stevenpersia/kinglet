import { useState } from 'react';
import type { VercelState } from '../../shared/types';
import { api, cleanError, useStore } from '../store';
import { Dot } from './Icons';

const TOKENS_URL = 'https://vercel.com/account/tokens';

const field = 'h-8 rounded-ui border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-line-strong';
const btn = 'flex h-8 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60';
const primary = 'flex h-8 items-center justify-center rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60';

/** Vercel connection: token, team, project, protection bypass. */
export function VercelSettings() {
  const vercel = useStore((s) => s.vercel);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBypass, setConfirmBypass] = useState(false);

  const run = async (what: string, fn: () => Promise<VercelState>) => {
    setBusy(what);
    setError(null);
    try {
      useStore.setState({ vercel: await fn() });
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(null);
    }
  };

  if (!vercel?.connected) {
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-3.5">
        <p className="m-0 text-muted">
          Crée un jeton personnel sur{' '}
          <button onClick={() => api().openExternal(TOKENS_URL)} className="text-fg underline underline-offset-2">
            vercel.com/account/tokens
          </button>{' '}
          (portée : ton compte ou l’équipe du projet), puis colle-le ici. Il est chiffré avec le trousseau du système et ne quitte pas ta machine, sauf vers l’API Vercel.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void run('connect', () => api().vercel.connect(token)).then(() => setToken(''));
          }}
        >
          <label htmlFor="vercel-token" className="sr-only">
            Jeton Vercel
          </label>
          <input id="vercel-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Jeton Vercel" autoComplete="off" spellCheck={false} className={`${field} flex-1 font-mono`} />
          <button type="submit" disabled={!token.trim() || !!busy} className={primary}>
            {busy ? 'Connexion…' : 'Connecter'}
          </button>
        </form>
        {(error ?? vercel?.error) && <p className="m-0 text-xs text-err">{error ?? vercel?.error}</p>}
      </div>
    );
  }

  const p = vercel.project;
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="flex items-center gap-3 p-3.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-fg">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 L22 20 H2 Z" fill="#0a0a0b" />
          </svg>
        </span>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">Connecté en tant que {vercel.user?.username}</span>
          <span className="text-xs text-muted">
            {vercel.storage === 'keyring' ? 'Jeton chiffré par le trousseau du système.' : vercel.storage === 'basic' ? 'Aucun trousseau détecté : jeton chiffré avec une clé faible.' : 'Chiffrement indisponible : jeton stocké en clair (fichier lisible par toi seul).'}
          </span>
        </div>
        <button onClick={() => void run('disconnect', () => api().vercel.disconnect())} className={btn}>
          Déconnecter
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-line-soft p-3.5">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Compte ou équipe
          <select value={vercel.teamId ?? ''} onChange={(e) => void run('team', () => api().vercel.selectTeam(e.target.value || null))} className={`${field} min-w-44`}>
            <option value="">{vercel.user?.username} (personnel)</option>
            {vercel.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Projet lié à ce site
          <select value={p?.id ?? ''} onChange={(e) => void run('link', () => api().vercel.link(e.target.value || null))} className={`${field} min-w-56`}>
            <option value="">— Choisir un projet ({vercel.projects.length}) —</option>
            {vercel.projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.repo ? ` · ${x.repo}` : ''}
              </option>
            ))}
          </select>
        </label>
        {busy && <span className="pb-2 text-xs text-faint">…</span>}
      </div>

      {p && (
        <div className="flex flex-col gap-2 border-t border-line-soft p-3.5 text-xs">
          <div className="flex gap-3">
            <span className="w-36 shrink-0 text-faint">Production</span>
            <span className="font-mono text-fg">{p.productionUrl ?? 'aucun domaine'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-36 shrink-0 text-faint">Déploiements</span>
            <span className="text-fg">
              {vercel.deployments.length} · synchronisés {vercel.syncedAt ? new Date(vercel.syncedAt).toLocaleTimeString('fr-FR') : '—'} (toutes les 30 s)
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-36 shrink-0 text-faint">Previews protégées</span>
            {p.bypassSecrets.length ? (
              <span className="flex items-center gap-1.5 text-fg">
                <Dot className="bg-ok" />
                Secret de contournement trouvé : Parakeet ouvre et lit les previews protégées.
              </span>
            ) : confirmBypass ? (
              <span className="flex flex-col gap-2 text-muted">
                Parakeet va créer un secret « Protection Bypass for Automation » dans les réglages de ton projet Vercel. Il permet d’ouvrir les previews sans te connecter ; tu pourras le révoquer dans Vercel.
                <span className="flex gap-2">
                  <button onClick={() => void run('bypass', () => api().vercel.generateBypass()).then(() => setConfirmBypass(false))} disabled={!!busy} className={primary}>
                    Créer le secret
                  </button>
                  <button onClick={() => setConfirmBypass(false)} className={btn}>
                    Annuler
                  </button>
                </span>
              </span>
            ) : (
              <span className="flex flex-col items-start gap-2 text-muted">
                Aucun secret. Si tes previews demandent une connexion Vercel, Parakeet ne pourra ni les afficher ni lire leurs balises.
                <button onClick={() => setConfirmBypass(true)} className={btn}>
                  Créer un secret de contournement…
                </button>
              </span>
            )}
          </div>
        </div>
      )}
      {(error ?? vercel.error) && <p className="m-0 border-t border-line-soft px-3.5 py-2.5 text-xs text-err">{error ?? vercel.error}</p>}
    </div>
  );
}
