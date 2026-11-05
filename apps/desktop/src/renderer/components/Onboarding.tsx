import { resolveLanguage, t } from '@parakeet/core';
import { useEffect, useState } from 'react';
import type { ClaudeCli, Language, LocalServer, VercelTeamProject } from '../../shared/types';
import { patchProject } from '../../shared/projects';
import { setActiveIds } from '../../shared/devices';
import { api, cleanError, useStore } from '../store';
import { Icon } from './Icons';

const field = 'h-8 min-w-0 flex-1 rounded-ui border border-line bg-bg px-2.5 font-mono text-xs text-fg outline-none focus:border-line-strong';
const btn = 'flex h-8 shrink-0 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong disabled:opacity-60';
const tilde = (p: string) => p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');

const DEVICE_SETS = (): { id: string; label: string; ids: string[] }[] => [
  { id: 'duo', label: t('Phone + tablet', 'Téléphone + tablette'), ids: ['iphone-16', 'ipad-air'] },
  { id: 'phones', label: t('Phones', 'Téléphones'), ids: ['iphone-se', 'iphone-16', 'pixel-9'] },
  { id: 'all', label: t('Everything', 'Tout'), ids: ['iphone-16', 'pixel-9', 'ipad-air', 'laptop'] },
];

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit shrink-0 gap-0.5 rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={`flex h-7 items-center rounded-md px-3 text-xs font-medium whitespace-nowrap ${value === o.id ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-4 border-t border-line-soft px-3.5 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`font-medium ${disabled ? 'text-faint' : ''}`}>{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-[18px] w-[30px] shrink-0 rounded-full disabled:opacity-40 ${on ? 'bg-fg' : 'bg-raised shadow-[inset_0_0_0_1px_#34343a]'}`}>
        <span className={`absolute top-[3px] size-3 rounded-full transition-[left] motion-reduce:transition-none ${on ? 'left-[15px] bg-bg' : 'left-[3px] bg-faint'}`} />
      </button>
    </div>
  );
}

function Account({ icon, name, hint, connected, who, tokenUrl, optional, onConnect, error }: { icon: 'tri' | 'git'; name: string; hint: string; connected: boolean; who: string | null; tokenUrl: string; optional?: boolean; onConnect: (token: string) => Promise<void>; error: string | null }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-bg p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-active shadow-[inset_0_0_0_1px_#2a2a2f]">
          <Icon name={icon} size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 font-medium">
            {name}
            {optional && <span className="rounded-full bg-raised px-1.5 py-px text-[10px] font-medium tracking-[0.04em] text-muted uppercase">{t('optional', 'facultatif')}</span>}
          </span>
          <span className="text-xs text-muted">{hint}</span>
        </div>
        {connected && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ok">
            <Icon name="check" size={12} />
            {who}
          </span>
        )}
      </div>
      {!connected && (
        <form
          className="flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!token.trim()) return;
            setBusy(true);
            await onConnect(token);
            setBusy(false);
          }}
        >
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder={t('Personal token', 'Jeton personnel')} aria-label={t(`${name} token`, `Jeton ${name}`)} className={field} />
          <button type="button" onClick={() => api().openExternal(tokenUrl)} className={btn}>
            {t('Create one', 'En créer un')}
          </button>
          <button type="submit" disabled={busy || !token.trim()} className="flex h-8 shrink-0 items-center rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-50">
            {busy ? '…' : t('Connect', 'Connecter')}
          </button>
        </form>
      )}
      {error && !connected && <p className="m-0 text-xs text-err">{error}</p>}
    </div>
  );
}

type Choice = { kind: 'server'; server: LocalServer } | { kind: 'vercel'; project: VercelTeamProject } | { kind: 'address' };

/** First run: language and devices, accounts, a first project, Claude. Every step can be skipped. */
export function Onboarding() {
  const s = useStore();
  const { settings, updateSettings, vercel, github } = s;
  const [step, setStep] = useState(0);
  const [devSet, setDevSet] = useState('duo');
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [address, setAddress] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [vercelError, setVercelError] = useState<string | null>(null);
  const [cli, setCli] = useState<ClaudeCli | null>(null);
  const [wantMcp, setWantMcp] = useState(true);
  const [wantHooks, setWantHooks] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api().setPreviewsVisible(false);
    void api().localServers().then((list) => {
      setServers(list);
      if (list[0]) setChoice((c) => c ?? { kind: 'server', server: list[0]! });
    });
    void api().chat.cli().then(setCli);
    return () => api().setPreviewsVisible(useStore.getState().section === 'apercu' && !!useStore.getState().url);
  }, []);
  // The folder that goes with the chosen site.
  useEffect(() => {
    if (!choice) return setFolder(null);
    if (choice.kind === 'server') {
      // Same folder as a Vercel project linked on disk: that project, with its previews.
      setFolder(choice.server.folder);
    } else if (choice.kind === 'vercel') {
      setFolder(null);
      void api().findFolder(choice.project.id).then((f) => setFolder((cur) => cur ?? f));
    } else setFolder(null);
  }, [choice]);

  const systemLang = resolveLanguage('system', navigator.language) === 'fr' ? 'Français' : 'English';
  const steps = [t('Welcome', 'Bienvenue'), t('Accounts', 'Comptes'), t('First project', 'Premier projet'), 'Claude'];
  const vercelProjects = [...(vercel?.projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      const set = DEVICE_SETS().find((d) => d.id === devSet)!;
      await updateSettings(setActiveIds(s.presets, useStore.getState().settings, set.ids));
      if (cli?.found && wantMcp) await api().chat.installMcp();
      if (wantHooks) useStore.setState({ claudeHooks: await api().claude.install() });
      // The first project, opened in a tab.
      const st = useStore.getState();
      if (choice?.kind === 'server') await st.openAddress(choice.server.url);
      else if (choice?.kind === 'vercel') await st.openVercelProject(choice.project);
      else if (choice?.kind === 'address' && address.trim()) {
        const raw = address.trim();
        await st.openAddress(/^\d+$/.test(raw) ? `http://localhost:${raw}/` : /^https?:\/\//.test(raw) ? raw : `http://${raw}`);
      }
      const after = useStore.getState();
      if (folder && after.settings.activeId) await after.updateSettings(patchProject(after.settings, after.settings.activeId, { folder }));
      await useStore.getState().updateSettings({ onboarded: true });
    } catch (e) {
      setError(cleanError(e));
      setFinishing(false);
      return;
    }
  };
  const skipAll = () => void updateSettings({ onboarded: true });

  const row = (on: boolean) => `flex w-full items-center gap-2.5 border-t border-line-soft px-3 py-2 text-left text-[12.5px] first:border-t-0 ${on ? 'bg-active shadow-[inset_2px_0_0_#ededef]' : 'hover:bg-active/60'}`;
  const radio = (on: boolean) => <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-full border ${on ? 'border-4 border-fg' : 'border-line-strong'}`} />;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6">
      <div role="dialog" aria-modal="true" aria-label={t('Welcome to Parakeet', 'Bienvenue dans Parakeet')} className="flex max-h-full w-[640px] flex-col overflow-hidden rounded-[14px] border border-line bg-card shadow-2xl shadow-black/70">
        <div role="tablist" className="flex shrink-0 gap-1.5 px-6 pt-5">
          {steps.map((label, i) => (
            <button key={label} role="tab" aria-selected={i === step} onClick={() => setStep(i)} className={`flex flex-1 flex-col gap-2 text-left text-[11.5px] ${i === step ? 'text-fg' : 'text-ghost hover:text-faint'}`}>
              <span className={`block h-[3px] rounded-full ${i === step ? 'bg-fg' : i < step ? 'bg-muted' : 'bg-raised'}`} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-h-[400px] flex-col gap-4 overflow-y-auto px-6 pt-6 pb-5">
          {step === 0 && (
            <>
              <div>
                <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Welcome to Parakeet', 'Bienvenue dans Parakeet')}</h2>
                <p className="m-0 mt-1.5 text-muted">{t('Your site on every screen, locally, in preview and in production, and your link previews before you share them.', 'Ton site sur tous les écrans, en local, en preview et en prod, et l’aperçu de tes liens avant de les partager.')}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="font-medium">{t('Language', 'Langue')}</span>
                  <span className="text-xs text-muted">{t('Can be changed in the settings.', 'Modifiable plus tard dans les réglages.')}</span>
                </div>
                <Seg<Language>
                  label={t('Language', 'Langue')}
                  value={settings.language}
                  onChange={(language) => void updateSettings({ language })}
                  options={[
                    { id: 'system', label: `${t('System', 'Système')} (${systemLang})` },
                    { id: 'en', label: 'English' },
                    { id: 'fr', label: 'Français' },
                  ]}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="font-medium">{t('Your devices', 'Tes appareils')}</span>
                  <span className="text-xs text-muted">{t('What you see side by side to start with.', 'Ce que tu veux voir côte à côte au départ.')}</span>
                </div>
                <Seg label={t('Devices', 'Appareils')} value={devSet} onChange={setDevSet} options={DEVICE_SETS()} />
              </div>
              <span className="flex-1" />
              <span className="text-xs text-faint">{t('About a minute. Everything can be done later.', 'Environ une minute. Tout peut se faire plus tard.')}</span>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Link your accounts', 'Relie tes comptes')}</h2>
                <p className="m-0 mt-1.5 text-muted">{t('To find your projects, their previews and production without typing anything.', 'Pour retrouver tes projets, leurs previews et leur prod sans rien taper.')}</p>
              </div>
              <Account
                icon="tri"
                name="Vercel"
                hint={t('Projects, previews by branch, production, deployments.', 'Projets, previews par branche, prod, déploiements.')}
                connected={!!vercel?.connected}
                who={vercel?.user ? `${vercel.user.username}${vercel.teams.length ? t(` · ${vercel.teams.length} team${vercel.teams.length > 1 ? 's' : ''}`, ` · ${vercel.teams.length} équipe${vercel.teams.length > 1 ? 's' : ''}`) : ''}` : null}
                tokenUrl="https://vercel.com/account/tokens"
                error={vercelError}
                onConnect={async (token) => {
                  try {
                    setVercelError(null);
                    useStore.setState({ vercel: await api().vercel.connect(token) });
                  } catch (e) {
                    setVercelError(cleanError(e));
                  }
                }}
              />
              <Account
                icon="git"
                name="GitHub"
                optional
                hint={t('Your account, for the pull requests of your previews (coming next).', 'Ton compte, pour les pull requests de tes previews (bientôt).')}
                connected={!!github?.connected}
                who={github?.user?.login ?? null}
                tokenUrl="https://github.com/settings/personal-access-tokens/new"
                error={github?.error ?? null}
                onConnect={async (token) => {
                  useStore.setState({ github: await api().github.connect(token) });
                }}
              />
              <span className="text-xs text-faint">{t('Tokens stay on this computer, encrypted by the system keyring.', 'Les jetons restent sur cet ordinateur, chiffrés par le trousseau du système.')}</span>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Your first project', 'Ton premier projet')}</h2>
                <p className="m-0 mt-1.5 text-muted">{t('Pick a site. You can open others in tabs.', 'Choisis un site. Tu pourras en ouvrir d’autres en onglets.')}</p>
              </div>
              <div className="overflow-hidden rounded-[10px] border border-line">
                <div className="label border-b border-line-soft bg-chrome px-3 py-2">{t('Running on this computer', 'Trouvé sur ta machine')}</div>
                {servers.length ? (
                  servers.map((sv) => {
                    const on = choice?.kind === 'server' && choice.server.url === sv.url;
                    return (
                      <button key={sv.url} onClick={() => setChoice({ kind: 'server', server: sv })} className={row(on)}>
                        {radio(on)}
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-local" />
                        <span className="font-mono text-xs">localhost:{sv.port}</span>
                        {sv.folder && <span className="ml-auto truncate font-mono text-[11px] text-faint">{tilde(sv.folder)}</span>}
                      </button>
                    );
                  })
                ) : (
                  <p className="m-0 px-3 py-2.5 text-xs text-faint">{t('No dev server running. Start one (npm run dev) and it shows up here.', 'Aucun serveur de dev lancé. Lance-en un (npm run dev), il apparaîtra ici.')}</p>
                )}
                {vercel?.connected && (
                  <>
                    <div className="label border-y border-line-soft bg-chrome px-3 py-2">{t('Your Vercel projects', 'Tes projets Vercel')}</div>
                    {vercelProjects.map((vp) => {
                      const on = choice?.kind === 'vercel' && choice.project.id === vp.id;
                      return (
                        <button key={vp.id} onClick={() => setChoice({ kind: 'vercel', project: vp })} className={row(on)}>
                          {radio(on)}
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-prod" />
                          {vp.name}
                          {vp.productionUrl && <span className="ml-auto truncate font-mono text-[11px] text-faint">{vp.productionUrl.replace(/^https?:\/\//, '')}</span>}
                        </button>
                      );
                    })}
                  </>
                )}
                <button onClick={() => setChoice({ kind: 'address' })} className={`${row(choice?.kind === 'address')} border-t border-line-soft`}>
                  {radio(choice?.kind === 'address')}
                  <span className="text-muted">{t('Another address…', 'Autre adresse…')}</span>
                </button>
                {choice?.kind === 'address' && (
                  <div className="flex border-t border-line-soft bg-bg px-3 py-2">
                    <input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="3000, localhost:5173, https://…" aria-label={t('Address', 'Adresse')} className={field} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3.5 py-2.5">
                <Icon name="folder" size={14} className="shrink-0 text-faint" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[12.5px] font-medium">{t('Project folder', 'Dossier du projet')}</span>
                  <span className="text-xs text-muted">
                    {folder ? t('Found automatically. Claude works in it.', 'Trouvé tout seul. C’est là que Claude travaille.') : t('Where the code is, for Claude. Optional.', 'Où est le code, pour Claude. Facultatif.')}
                  </span>
                </div>
                {folder && <span className="max-w-48 truncate font-mono text-[11.5px] text-muted">{tilde(folder)}</span>}
                <button
                  onClick={async () => {
                    const r = await api().projects.pickFolder();
                    if (r) setFolder(r.folder);
                  }}
                  className={btn}
                >
                  {folder ? t('Change', 'Changer') : t('Choose…', 'Choisir…')}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">{t('Work with Claude', 'Travailler avec Claude')}</h2>
                <p className="m-0 mt-1.5 text-muted">{t('Claude sees your devices, changes your code and checks the result itself.', 'Claude voit tes appareils, modifie ton code et vérifie lui-même le résultat.')}</p>
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg p-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-active shadow-[inset_0_0_0_1px_#2a2a2f]">
                  <Icon name="spark" size={14} className="text-[#d97757]" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">Claude Code</span>
                  <span className="truncate text-xs text-muted">
                    {!cli
                      ? t('Looking…', 'Recherche…')
                      : cli.found
                        ? t(`Found: ${cli.version ?? ''} in ${tilde(cli.path ?? '')}`, `Trouvé : ${cli.version ?? ''} dans ${tilde(cli.path ?? '')}`)
                        : t('Not found. Install it to use Claude: npm install -g @anthropic-ai/claude-code', 'Introuvable. Installe-le pour utiliser Claude : npm install -g @anthropic-ai/claude-code')}
                  </span>
                </div>
                {cli?.found && (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-ok">
                    <Icon name="check" size={12} />
                    {t('ready', 'prêt')}
                  </span>
                )}
              </div>
              <div className="overflow-hidden rounded-[10px] border border-line bg-card">
                <Toggle label={t('Claude in Parakeet', 'Claude dans Parakeet')} hint={t('A column always at hand to ask and show.', 'Une colonne toujours à portée pour demander et montrer.')} on={settings.claudePanel} onChange={(claudePanel) => void updateSettings({ claudePanel })} />
                <Toggle label={t('Claude in the terminal', 'Claude dans le terminal')} hint={t('Installs the MCP server for all your projects.', 'Installe le serveur MCP pour tous tes projets.')} on={wantMcp && !!cli?.found} disabled={!cli?.found} onChange={setWantMcp} />
                <Toggle label={t('Session tracking', 'Suivi des sessions')} hint={t('The tab pulses while Claude works, a notification when it is done.', 'L’onglet pulse quand Claude travaille, une notification quand il a fini.')} on={wantHooks} onChange={setWantHooks} />
              </div>
              {error && <p className="m-0 text-xs text-err">{error}</p>}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-line-soft bg-chrome px-6 py-3.5">
          <button onClick={step === 0 ? skipAll : () => setStep(step + 1)} className="text-xs text-faint hover:text-fg">
            {step === 0 ? t('Skip setup', 'Passer l’accueil') : step === 3 ? '' : t('Later', 'Plus tard')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className={btn}>
                {t('Back', 'Retour')}
              </button>
            )}
            <button disabled={finishing} onClick={() => (step === 3 ? void finish() : setStep(step + 1))} className="flex h-8 items-center rounded-ui bg-fg px-4 text-xs font-semibold text-bg disabled:opacity-60">
              {step === 3 ? (finishing ? t('Opening…', 'Ouverture…') : t('Open Parakeet', 'Ouvrir Parakeet')) : t('Continue', 'Continuer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
