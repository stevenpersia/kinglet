import { t } from '@kinglet/core';
import type { FeedbackPin } from './types';

/** Path and query of a page URL (the whole string when it isn't one). */
export const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

/** Title of an issue (GitHub, Linear) for the open pins. */
export const feedbackTitle = (count: number) => t(`Feedback · ${count} point${count > 1 ? 's' : ''}`, `Retours · ${count} point${count > 1 ? 's' : ''}`);

/**
 * A Slack Incoming Webhook: https://hooks.slack.com/services/T…/B…/secret. Anything else is refused
 * before it is stored (the URL is a secret: it is only ever sent to hooks.slack.com).
 */
export function isSlackWebhook(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com' && /^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+\/?$/.test(u.pathname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/** The webhook shown in the settings without its secret: hooks.slack.com/services/T0…/B0…/••••. */
export function maskSlackWebhook(url: string): string {
  const m = url.trim().match(/^https:\/\/hooks\.slack\.com\/services\/([A-Z0-9]+)\/([A-Z0-9]+)\//);
  return m ? `hooks.slack.com/services/${m[1]}/${m[2]}/••••` : 'hooks.slack.com/••••';
}

/** Slack mrkdwn: &, < and > must be escaped, the rest is shown as typed. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Inline code without backticks inside it (they would close it). */
const code = (s: string) => `\`${esc(s.replace(/`/g, 'ʼ'))}\``;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export interface SlackMessage {
  text: string;
  blocks: Record<string, unknown>[];
}

/** Slack refuses more than 50 blocks; a section holds 3000 characters. */
const MAX_PINS = 20;

/**
 * The open pins as a Slack message (Block Kit). A webhook cannot upload images: `images` (pin id →
 * URL) links the captures already sent to GitHub or Linear; without it, the message says they stay in Kinglet.
 * `issueUrl`: the issue opened with them, linked at the bottom.
 */
export function slackMessage(projectName: string, pins: FeedbackPin[], opts: { images?: Record<string, string>; issueUrl?: string | null } = {}): SlackMessage {
  const images = opts.images ?? {};
  const shown = pins.slice(0, MAX_PINS);
  const title = t(`Feedback on ${projectName} · ${pins.length} point${pins.length > 1 ? 's' : ''}`, `Retours sur ${projectName} · ${pins.length} point${pins.length > 1 ? 's' : ''}`);
  const blocks: Record<string, unknown>[] = [{ type: 'header', text: { type: 'plain_text', text: clip(title, 150), emoji: false } }];
  for (const p of shown) {
    const where = [`*${p.n}. ${esc(p.deviceLabel)}*`, code(pathOf(p.url))];
    if (p.selector) where.push(code(clip(p.selector, 80)));
    if (p.elementText) where.push(`« ${esc(clip(p.elementText, 60))} »`);
    const lines = [where.join(' · ')];
    const comment = p.comment.trim() || t('(no comment)', '(sans commentaire)');
    lines.push(`${p.author ? `*${esc(p.author)}*${t(':', ' :')} ` : ''}${esc(clip(comment, 1500))}`);
    for (const r of p.replies ?? []) lines.push(`> *${esc(r.author ?? t('Team', 'Équipe'))}*${t(':', ' :')} ${esc(clip(r.text, 400))}`);
    if (images[p.id]) lines.push(`<${images[p.id]}|${t('Capture', 'Capture')}>`);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clip(lines.join('\n'), 2900) } });
  }
  const notes: string[] = [];
  if (pins.length > shown.length) notes.push(t(`+${pins.length - shown.length} more in Kinglet.`, `+${pins.length - shown.length} de plus dans Kinglet.`));
  const withImage = pins.filter((p) => p.image).length;
  if (opts.issueUrl) notes.push(`<${opts.issueUrl}|${t('Open the issue', 'Voir l’issue')}>`);
  if (withImage && !shown.some((p) => images[p.id])) notes.push(t('Pinned in Kinglet (the captures stay in the app).', 'Épinglé dans Kinglet (les captures restent dans l’app).'));
  else notes.push(t('Pinned in Kinglet.', 'Épinglé dans Kinglet.'));
  blocks.push({ type: 'divider' }, { type: 'context', elements: [{ type: 'mrkdwn', text: notes.join(' · ') }] });
  return { text: title, blocks };
}

/** What Slack answers a webhook, in words (its body is a short code: no_service, invalid_token…). */
export function slackError(status: number, body: string): string {
  const code = body.trim();
  if (status === 404 || code === 'no_service' || code === 'no_team') return t('Slack doesn’t know this webhook anymore (deleted or disabled).', 'Slack ne connaît plus ce webhook (supprimé ou désactivé).');
  if (status === 403 || code === 'invalid_token' || code === 'action_prohibited') return t('Slack refused this webhook.', 'Slack refuse ce webhook.');
  if (status === 410 || code === 'channel_is_archived') return t('The webhook’s channel is archived.', 'Le canal du webhook est archivé.');
  if (code === 'channel_not_found') return t('The webhook’s channel no longer exists.', 'Le canal du webhook n’existe plus.');
  if (status === 400) return t(`Slack refused the message (${code || 'invalid_payload'}).`, `Slack refuse le message (${code || 'invalid_payload'}).`);
  return `Slack: HTTP ${status}${code ? ` (${code})` : ''}`;
}

/** A Linear team, as chosen for a project. */
export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

/** The team to send a project's feedback to: the one chosen, or the only one there is. */
export function linearTeamFor(teams: LinearTeam[], chosen: string | null | undefined): LinearTeam | null {
  if (chosen) return teams.find((x) => x.id === chosen) ?? null;
  return teams.length === 1 ? teams[0]! : null;
}

/** Errors of a Linear GraphQL answer, in words. */
export function linearError(status: number, errors: { message?: string; extensions?: { code?: string; type?: string; userPresentableMessage?: string } }[] | undefined): string | null {
  const first = errors?.[0];
  const code = `${first?.extensions?.code ?? ''} ${first?.extensions?.type ?? ''}`.toLowerCase();
  if (status === 401 || /authentication/.test(code)) return t('Linear refused this API key.', 'Linear refuse cette clé d’API.');
  if (status === 403 || /forbidden/.test(code)) return t('This API key has no access to that.', 'Cette clé d’API n’y a pas accès.');
  if (status === 429 || /ratelimit/.test(code)) return t('Linear: too many requests, try again in a minute.', 'Linear : trop de requêtes, réessaie dans une minute.');
  if (first) return `Linear${t(':', ' :')} ${first.extensions?.userPresentableMessage ?? first.message ?? code.trim()}`;
  if (status >= 400) return `Linear: HTTP ${status}`;
  return null;
}
