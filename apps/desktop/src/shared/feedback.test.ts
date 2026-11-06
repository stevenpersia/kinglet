import { setLanguage } from '@kinglet/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { feedbackTitle, isSlackWebhook, linearError, linearTeamFor, maskSlackWebhook, slackError, slackMessage } from './feedback';
import type { FeedbackPin } from './types';

beforeAll(() => setLanguage('fr'));

const pin = (n: number, patch: Partial<FeedbackPin> = {}): FeedbackPin => ({
  id: `p${n}`,
  n,
  deviceId: 'iphone-16',
  deviceLabel: 'iPhone 16',
  url: 'http://localhost:5173/contact?x=1',
  x: 1,
  y: 2,
  selector: 'main > h1',
  elementText: 'Bienvenue',
  comment: 'Plus gros <svp> & plus haut',
  image: null,
  createdAt: 1,
  done: false,
  ...patch,
});

describe('Slack webhook', () => {
  it('accepts only https://hooks.slack.com/services/… URLs', () => {
    expect(isSlackWebhook('https://hooks.slack.com/services/T0123ABC/B0456DEF/aZ09xyzXYZ')).toBe(true);
    expect(isSlackWebhook('  https://hooks.slack.com/services/T0123ABC/B0456DEF/aZ09xyzXYZ  ')).toBe(true);
    expect(isSlackWebhook('http://hooks.slack.com/services/T0123ABC/B0456DEF/aZ09xyz')).toBe(false);
    expect(isSlackWebhook('https://hooks.slack.com.evil.com/services/T0123ABC/B0456DEF/aZ09xyz')).toBe(false);
    expect(isSlackWebhook('https://evil.com/?u=https://hooks.slack.com/services/T0/B0/x')).toBe(false);
    expect(isSlackWebhook('https://hooks.slack.com/services/T0123ABC/B0456DEF/aZ09xyz?x=1')).toBe(false);
    expect(isSlackWebhook('https://hooks.slack.com/workflows/T0/A0/1/x')).toBe(false);
    expect(isSlackWebhook('pas une url')).toBe(false);
  });

  it('is shown without its secret', () => {
    expect(maskSlackWebhook('https://hooks.slack.com/services/T0123ABC/B0456DEF/aZ09xyzXYZ')).toBe('hooks.slack.com/services/T0123ABC/B0456DEF/••••');
  });

  it('turns Slack’s answers into words', () => {
    expect(slackError(404, 'no_service')).toMatch(/ne connaît plus/);
    expect(slackError(403, 'invalid_token')).toMatch(/refuse ce webhook/);
    expect(slackError(410, 'channel_is_archived')).toMatch(/archivé/);
    expect(slackError(400, 'invalid_blocks')).toMatch(/invalid_blocks/);
    expect(slackError(500, '')).toBe('Slack: HTTP 500');
  });
});

describe('Slack message', () => {
  it('lists each pin with its device, page, element, comment and thread, escaped', () => {
    const m = slackMessage('Maison Sable', [pin(1, { author: 'Léa', replies: [{ author: null, text: 'Fait', at: 2 }] }), pin(2, { comment: '', selector: null, elementText: null })]);
    expect(m.text).toBe('Retours sur Maison Sable · 2 points');
    expect(m.blocks[0]).toMatchObject({ type: 'header' });
    const first = (m.blocks[1] as { text: { text: string } }).text.text;
    expect(first).toContain('*1. iPhone 16*');
    expect(first).toContain('`/contact?x=1`');
    expect(first).toContain('`main &gt; h1`');
    expect(first).toContain('« Bienvenue »');
    expect(first).toContain('*Léa* : Plus gros &lt;svp&gt; &amp; plus haut');
    expect(first).toContain('> *Équipe* : Fait');
    expect((m.blocks[2] as { text: { text: string } }).text.text).toContain('(sans commentaire)');
    const context = JSON.stringify(m.blocks.at(-1));
    expect(context).toContain('Épinglé dans Kinglet.');
  });

  it('links the captures and the issue already sent, or says the captures stay in Kinglet', () => {
    const pins = [pin(1, { image: 'data:image/jpeg;base64,xx' })];
    expect(JSON.stringify(slackMessage('S', pins).blocks.at(-1))).toContain('les captures restent dans l’app');
    const m = slackMessage('S', pins, { images: { p1: 'https://uploads.linear.app/a.jpg' }, issueUrl: 'https://linear.app/x/issue/ABC-1' });
    expect((m.blocks[1] as { text: { text: string } }).text.text).toContain('<https://uploads.linear.app/a.jpg|Capture>');
    expect(JSON.stringify(m.blocks.at(-1))).toContain('<https://linear.app/x/issue/ABC-1|Voir l’issue>');
  });

  it('stays under Slack’s limits', () => {
    const many = Array.from({ length: 30 }, (_, i) => pin(i + 1, { comment: 'x'.repeat(5000) }));
    const m = slackMessage('S', many);
    expect(m.blocks.length).toBeLessThanOrEqual(50);
    for (const b of m.blocks) if (b.type === 'section') expect((b as { text: { text: string } }).text.text.length).toBeLessThanOrEqual(3000);
    expect(JSON.stringify(m.blocks.at(-1))).toContain('+10 de plus dans Kinglet.');
  });
});

describe('Linear', () => {
  const teams = [
    { id: 't1', key: 'WEB', name: 'Web' },
    { id: 't2', key: 'OPS', name: 'Ops' },
  ];
  it('picks the team chosen for the project, or the only one', () => {
    expect(linearTeamFor(teams, 't2')?.key).toBe('OPS');
    expect(linearTeamFor(teams, null)).toBeNull();
    expect(linearTeamFor(teams, 'gone')).toBeNull();
    expect(linearTeamFor([teams[0]!], undefined)?.key).toBe('WEB');
  });

  it('turns GraphQL errors into words', () => {
    expect(linearError(401, undefined)).toMatch(/refuse cette clé/);
    expect(linearError(400, [{ message: 'Authentication required', extensions: { type: 'authentication error' } }])).toMatch(/refuse cette clé/);
    expect(linearError(200, [{ message: 'Entity not found', extensions: { userPresentableMessage: 'Équipe introuvable' } }])).toBe('Linear : Équipe introuvable');
    expect(linearError(200, undefined)).toBeNull();
  });

  it('titles the issue like GitHub does', () => {
    expect(feedbackTitle(1)).toBe('Retours · 1 point');
    expect(feedbackTitle(3)).toBe('Retours · 3 points');
  });
});
