import { describe, expect, it } from 'vitest';
import { setLanguage } from '@kinglet/core';
import { ClaudeTracker, IDLE_AFTER_MS, reloadAfterTask } from './claude';

const P = { id: 'shop', folder: '/home/s/dev/shop' };

describe('ClaudeTracker', () => {
  it('follows a task: prompt, edits, stop', () => {
    const t = new ClaudeTracker();
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'le hero   déborde\nsur mobile' }, P, 1000);
    expect(t.projects.shop).toMatchObject({ status: 'working', since: 1000, prompt: 'le hero déborde sur mobile', seen: false });
    t.ingest({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: '/home/s/dev/shop/src/Hero.tsx' } }, P, 2000);
    t.ingest({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: '/home/s/dev/shop/src/Hero.tsx' } }, P, 2500);
    t.ingest({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'pnpm build', description: 'Build the site' } }, P, 2600);
    expect(t.projects.shop).toMatchObject({ status: 'working', since: 1000, files: ['src/Hero.tsx'], lastAction: 'Claude runs Build the site' });
    const r = t.ingest({ hook_event_name: 'Stop', session_id: 's1' }, P, 3000);
    expect(r?.finished).toBe(true);
    expect(t.projects.shop).toMatchObject({ status: 'done', seen: false, files: ['src/Hero.tsx'] });
    expect(t.markSeen('shop')).toBe(true);
    expect(t.projects.shop!.seen).toBe(true);
    expect(t.projects.shop!.events.map((e) => e.kind)).toEqual(['stop', 'tool', 'tool', 'tool', 'prompt']);
  });

  it('stays working while another session of the project runs; ignores subagent stops', () => {
    const t = new ClaudeTracker();
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 'a', prompt: 'x' }, P, 1);
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 'b', prompt: 'y' }, P, 2);
    expect(t.ingest({ hook_event_name: 'Stop', session_id: 'a', agent_id: 'sub' }, P, 3)).toBeNull();
    expect(t.ingest({ hook_event_name: 'Stop', session_id: 'a' }, P, 4)?.finished).toBe(false);
    expect(t.projects.shop!.status).toBe('working');
    expect(t.ingest({ hook_event_name: 'Stop', session_id: 'b' }, P, 5)?.finished).toBe(true);
  });

  it('waiting on a permission, then back to work', () => {
    const t = new ClaudeTracker();
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'x' }, P, 1);
    t.ingest({ hook_event_name: 'Notification', session_id: 's', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }, P, 2);
    expect(t.projects.shop).toMatchObject({ status: 'waiting', lastAction: 'Claude needs your permission to use Bash' });
    expect(t.ingest({ hook_event_name: 'Notification', session_id: 's', notification_type: 'idle_prompt' }, P, 3)).toBeNull();
    t.ingest({ hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'Bash', tool_input: { command: 'ls' } }, P, 4);
    expect(t.projects.shop).toMatchObject({ status: 'working', since: 1 });
  });

  it('a silent session goes idle; errors finish the task', () => {
    const t = new ClaudeTracker();
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'x' }, P, 0);
    expect(t.expire(IDLE_AFTER_MS - 1)).toBe(false);
    expect(t.expire(IDLE_AFTER_MS + 1)).toBe(true);
    expect(t.projects.shop!.status).toBe('idle');
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'x' }, P, 10);
    t.ingest({ hook_event_name: 'StopFailure', session_id: 's', error: 'rate_limit' }, P, 11);
    expect(t.projects.shop).toMatchObject({ status: 'done', lastAction: 'Error: rate_limit' });
    setLanguage('fr');
    t.ingest({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'x' }, P, 12);
    t.ingest({ hook_event_name: 'StopFailure', session_id: 's' }, P, 13);
    setLanguage('en');
    expect(t.projects.shop).toMatchObject({ status: 'done', lastAction: 'Erreur : la requête a échoué' });
  });

  it('events outside any project go to the shared feed', () => {
    const t = new ClaudeTracker();
    t.ingest({ hook_event_name: 'SessionStart', session_id: 's' }, null, 1);
    expect(t.projects['']!.events[0]).toMatchObject({ kind: 'start', projectId: null });
    expect(t.ingest({ hook_event_name: 'PreCompact', session_id: 's' }, null, 2)).toBeNull();
  });
});

describe('reloadAfterTask', () => {
  const ok = { enabled: true, error: false, projectId: 'shop', shownId: 'shop', localOrigin: 'http://localhost:3000', url: 'http://localhost:3000/pricing' };
  it('reloads the local site of the project that finished, edit tools or not', () => {
    expect(reloadAfterTask(ok)).toBe(true);
    expect(reloadAfterTask({ ...ok, url: 'http://127.0.0.1:5173/', localOrigin: null })).toBe(true);
    // The same folder linked to another project: the devices show its dev server.
    expect(reloadAfterTask({ ...ok, shownId: 'shop-local' })).toBe(true);
  });
  it('leaves the devices alone otherwise', () => {
    expect(reloadAfterTask({ ...ok, enabled: false })).toBe(false);
    expect(reloadAfterTask({ ...ok, error: true })).toBe(false);
    expect(reloadAfterTask({ ...ok, shownId: 'docs', url: 'http://localhost:5173/' })).toBe(false);
    expect(reloadAfterTask({ ...ok, url: 'https://shop-git-feat.vercel.app/' })).toBe(false);
    expect(reloadAfterTask({ ...ok, url: null })).toBe(false);
  });
});
