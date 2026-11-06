import { join } from 'node:path';
import { t } from '@kinglet/core';
import { isSlackWebhook, maskSlackWebhook, slackError, type SlackMessage } from '../shared/feedback';
import type { SlackState } from '../shared/types';
import { secretFile } from './secret';

/** Slack Incoming Webhook (encrypted like the tokens): posts the feedback of a project in a channel. */
export class SlackService {
  private file: string;
  private url: string | null = null;
  state: SlackState = { connected: false, hint: null, error: null };

  constructor(
    userData: string,
    private emit: (s: SlackState) => void,
  ) {
    this.file = join(userData, 'slack.json');
  }

  private update(patch: Partial<SlackState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  private async post(url: string, message: Pick<SlackMessage, 'text'> & Partial<SlackMessage>) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new Error(t(`Slack unreachable (${(e as Error).message}).`, `Slack injoignable (${(e as Error).message}).`));
    }
    const body = await res.text().catch(() => '');
    if (!res.ok || body.trim() !== 'ok') throw new Error(slackError(res.status, body));
  }

  restore() {
    try {
      this.url = secretFile.read(this.file);
      if (this.url) this.update({ connected: true, hint: maskSlackWebhook(this.url), error: null });
    } catch (e) {
      this.update({ error: t(`Couldn’t read the Slack webhook: ${(e as Error).message}`, `Webhook Slack illisible : ${(e as Error).message}`) });
    }
  }

  /** Checked by posting a short message in its channel: a webhook has no other way to be tested. */
  async connect(url: string) {
    const clean = url.trim();
    if (!isSlackWebhook(clean)) {
      this.update({ error: t('This is not a Slack Incoming Webhook (https://hooks.slack.com/services/…).', 'Ce n’est pas un Incoming Webhook Slack (https://hooks.slack.com/services/…).') });
      return this.state;
    }
    try {
      await this.post(clean, { text: t('Kinglet is connected: feedback will be posted here.', 'Kinglet est relié : les retours seront postés ici.') });
    } catch (e) {
      this.update({ error: (e as Error).message });
      return this.state;
    }
    this.url = clean;
    secretFile.write(this.file, clean);
    this.update({ connected: true, hint: maskSlackWebhook(clean), error: null });
    return this.state;
  }

  disconnect() {
    this.url = null;
    secretFile.remove(this.file);
    this.update({ connected: false, hint: null, error: null });
    return this.state;
  }

  async send(message: SlackMessage) {
    if (!this.url) throw new Error(t('Slack not connected', 'Slack non connecté'));
    await this.post(this.url, message);
  }
}
