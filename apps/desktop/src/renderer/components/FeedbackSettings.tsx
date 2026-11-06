import { t } from '@kinglet/core';
import { useState } from 'react';
import { linearTeamFor } from '../../shared/feedback';
import { activeProject, patchProject } from '../../shared/projects';
import type { LinearState, SlackState } from '../../shared/types';
import { api, useStore } from '../store';
import { TokenHelp } from './GitHubSettings';

const LINEAR_KEY_URL = 'https://linear.app/settings/account/security';
const SLACK_APPS_URL = 'https://api.slack.com/apps?new_app=1';

const card = 'flex shrink-0 flex-col gap-3 rounded-[10px] border border-line bg-card p-3.5';
const input = 'h-8 min-w-0 flex-1 rounded-ui border border-line bg-bg px-2.5 font-mono text-xs text-fg outline-none focus:border-line-strong';
const primary = 'h-8 rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-50';
const secondary = 'h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium hover:border-line-strong disabled:opacity-60';

/** The Linear team of the active project's feedback (remembered per project). */
export function LinearTeamSelect({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const project = activeProject(s.settings);
  const teams = s.linear?.teams ?? [];
  if (!project || !s.linear?.connected || !teams.length) return null;
  const team = linearTeamFor(teams, project.linearTeamId);
  return (
    <select
      value={team?.id ?? ''}
      onChange={(e) => void s.updateSettings(patchProject(s.settings, project.id, { linearTeamId: e.target.value || null }))}
      aria-label={t(`Linear team for ${project.name}`, `Équipe Linear de ${project.name}`)}
      className={compact ? 'h-8 max-w-[120px] min-w-0 rounded-ui border border-[#2a2a2f] bg-active px-1.5 text-xs text-fg outline-none' : 'h-8 min-w-0 flex-1 rounded-ui border border-line bg-bg px-2 text-xs text-fg outline-none focus:border-line-strong'}
    >
      {!team && <option value="">{t('Choose a team…', 'Choisir une équipe…')}</option>}
      {teams.map((x) => (
        <option key={x.id} value={x.id}>
          {compact ? x.key : `${x.name} (${x.key})`}
        </option>
      ))}
    </select>
  );
}

/** Linear (optional): a personal API key, kept encrypted; feedback becomes an issue of the team chosen per project. */
export function LinearSettings() {
  const linear = useStore((s) => s.linear);
  const project = useStore((s) => activeProject(s.settings));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const set = async (p: Promise<LinearState>) => {
    setBusy(true);
    useStore.setState({ linear: await p });
    setBusy(false);
  };
  return (
    <div className={card}>
      {linear?.connected ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{linear.user?.name}</span>
              {linear.user?.email && <span className="font-mono text-xs text-muted">{linear.user.email}</span>}
            </div>
            <button disabled={busy} onClick={() => void set(api().linear.refresh())} className={secondary}>
              {t('Reload teams', 'Recharger les équipes')}
            </button>
            <button disabled={busy} onClick={() => void set(api().linear.disconnect())} className={secondary}>
              {t('Disconnect', 'Déconnecter')}
            </button>
          </div>
          {project ? (
            <label className="flex items-center gap-3 text-xs text-muted">
              <span className="shrink-0">{t(`Feedback of ${project.name} goes to`, `Les retours de ${project.name} vont dans`)}</span>
              <LinearTeamSelect />
            </label>
          ) : (
            <span className="text-xs text-muted">{t('Open a project to choose the team its feedback goes to.', 'Ouvre un projet pour choisir l’équipe de ses retours.')}</span>
          )}
          {!linear.teams.length && <p className="m-0 text-xs text-warn">{t('This key sees no team.', 'Cette clé ne voit aucune équipe.')}</p>}
          {linear.error && <p className="m-0 text-xs text-err">{linear.error}</p>}
        </>
      ) : (
        <>
          <span className="text-xs leading-relaxed text-muted">
            {t(
              'Optional. Send the feedback of the Feedback panel as a Linear issue, captures included, in the team chosen for each project.',
              'Facultatif. Envoie les retours du panneau Retours en issue Linear, captures comprises, dans l’équipe choisie pour chaque projet.',
            )}
          </span>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim()) void set(api().linear.connect(key)).then(() => setKey(''));
            }}
          >
            <input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="lin_api_…" aria-label={t('Linear API key', 'Clé d’API Linear')} className={input} />
            <button type="submit" disabled={busy || !key.trim()} className={primary}>
              {busy ? t('Checking…', 'Vérification…') : t('Connect', 'Connecter')}
            </button>
          </form>
          <TokenHelp
            name="Linear"
            url={LINEAR_KEY_URL}
            scopes={[t('Settings → Security & access → Personal API keys', 'Réglages → Security & access → Personal API keys'), t('Permissions: Read and Create issues (or Full access)', 'Permissions : Read et Create issues (ou Full access)'), t('Teams: those that receive feedback (or all)', 'Équipes : celles qui reçoivent les retours (ou toutes)')]}
          />
          {linear?.error && <p className="m-0 text-xs text-err">{linear.error}</p>}
        </>
      )}
    </div>
  );
}

/** Slack (optional): an Incoming Webhook of a channel, kept encrypted; feedback is posted there as a message. */
export function SlackSettings() {
  const slack = useStore((s) => s.slack);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const set = async (p: Promise<SlackState>) => {
    setBusy(true);
    const st = await p;
    useStore.setState({ slack: st });
    setBusy(false);
    return st;
  };
  return (
    <div className={card}>
      {slack?.connected ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{t('Webhook connected', 'Webhook relié')}</span>
              <span className="truncate font-mono text-xs text-muted">{slack.hint}</span>
            </div>
            <button disabled={busy} onClick={() => void set(api().slack.disconnect())} className={secondary}>
              {t('Remove', 'Retirer')}
            </button>
          </div>
          <span className="text-xs leading-relaxed text-faint">
            {t(
              'A webhook posts text only: the captures are linked when they were just sent to GitHub or Linear, otherwise they stay in Kinglet.',
              'Un webhook ne poste que du texte : les captures sont en lien quand elles viennent d’être envoyées sur GitHub ou Linear, sinon elles restent dans Kinglet.',
            )}
          </span>
        </>
      ) : (
        <>
          <span className="text-xs leading-relaxed text-muted">
            {t(
              'Optional. Post the feedback of the Feedback panel in a Slack channel. To check the webhook, Kinglet posts a short message in its channel.',
              'Facultatif. Poste les retours du panneau Retours dans un canal Slack. Pour vérifier le webhook, Kinglet poste un court message dans son canal.',
            )}
          </span>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void set(api().slack.connect(url)).then((st) => st.connected && setUrl(''));
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} type="password" placeholder="https://hooks.slack.com/services/…" aria-label={t('Slack webhook URL', 'URL du webhook Slack')} className={input} />
            <button type="submit" disabled={busy || !url.trim()} className={primary}>
              {busy ? t('Testing…', 'Test…') : t('Test and connect', 'Tester et relier')}
            </button>
          </form>
          <TokenHelp
            name="Slack"
            url={SLACK_APPS_URL}
            scopes={[t('Create an app (From scratch) in your workspace', 'Crée une app (From scratch) dans ton espace de travail'), t('Incoming Webhooks: on, then “Add New Webhook” and pick the channel', 'Incoming Webhooks : activé, puis « Add New Webhook » et choisis le canal'), t('Paste the webhook URL here', 'Colle l’URL du webhook ici')]}
          />
          {slack?.error && <p className="m-0 text-xs text-err">{slack.error}</p>}
        </>
      )}
    </div>
  );
}
