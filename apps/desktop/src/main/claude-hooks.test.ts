import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addHooks, ClaudeHooks, hasHooks, HOOK_EVENTS, removeHooks } from './claude-hooks';

const CMD = '/home/s/.config/Kinglet/claude-hook.sh';

describe('hooks in Claude Code settings', () => {
  const user = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] } };

  it('adds ours once, keeps the user’s', () => {
    const once = addHooks(user, CMD);
    expect(addHooks(once, CMD)).toEqual(once);
    expect(hasHooks(once, CMD)).toBe(true);
    expect(once.model).toBe('opus');
    expect(once.hooks!.Stop).toHaveLength(2);
    expect(once.hooks!.Stop![0]!.hooks[0]!.command).toBe('notify-send done');
    expect(once.hooks!.PostToolUse![0]).toEqual({ matcher: '*', hooks: [{ type: 'command', command: CMD, async: true, timeout: 5 }] });
    expect(Object.keys(once.hooks!).sort()).toEqual([...HOOK_EVENTS].sort());
  });

  it('removes only ours', () => {
    expect(removeHooks(addHooks(user, CMD), CMD)).toEqual(user);
    expect(removeHooks(addHooks({}, CMD), CMD)).toEqual({});
  });
});

describe('ClaudeHooks', () => {
  it('installs with a backup, refuses to touch a broken file, uninstalls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pk-hooks-'));
    const file = join(dir, 'claude', 'settings.json');
    const h = new ClaudeHooks(join(dir, 'userdata'), file);
    expect(h.state().installed).toBe(false);
    expect(h.install().installed).toBe(true); // no settings file yet
    expect(existsSync(h.script)).toBe(true);
    writeFileSync(file, '{ broken');
    expect(h.install()).toMatchObject({ installed: false });
    expect(readFileSync(file, 'utf8')).toBe('{ broken');
    writeFileSync(file, JSON.stringify({ theme: 'dark' }));
    h.install();
    expect(JSON.parse(readFileSync(`${file}.kinglet-backup`, 'utf8'))).toEqual({ theme: 'dark' });
    expect(h.uninstall().installed).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ theme: 'dark' });
    expect(existsSync(h.script)).toBe(false);
  });

  it('the script forwards stdin to the app, and stays silent when the app is closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pk-hookrun-'));
    const h = new ClaudeHooks(join(dir, 'userdata'), join(dir, 'settings.json'));
    h.install();
    // App closed: no env file.
    expect(execFileSync('sh', [h.script], { input: '{"a":1}' }).toString()).toBe('');

    const got: { auth?: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got.push({ auth: req.headers.authorization, body });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    h.publish((server.address() as { port: number }).port, 'tok');
    const out = await new Promise<string>((resolve, reject) => {
      const { execFile } = require('node:child_process') as typeof import('node:child_process');
      const child = execFile('sh', [h.script], (err, stdout) => (err ? reject(err) : resolve(stdout)));
      child.stdin!.end('{"hook_event_name":"Stop"}');
    });
    server.close();
    expect(out).toBe('');
    expect(got).toEqual([{ auth: 'Bearer tok', body: '{"hook_event_name":"Stop"}' }]);
    h.unpublish();
  });
});

describe('rename from Parakeet', () => {
  it('points hooks installed under the old name to the new script, keeps the user’s', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-hooks-'));
    const file = join(dir, 'settings.json');
    const old = '/home/s/.config/Parakeet/claude-hook.sh';
    writeFileSync(file, JSON.stringify(addHooks({ model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] } }, old)));
    const hooks = new ClaudeHooks(join(dir, 'Kinglet'), file);
    expect(hooks.repoint(old)).toBe(true);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    expect(hasHooks(after, hooks.script)).toBe(true);
    expect(JSON.stringify(after)).not.toContain(old);
    expect(after.hooks.Stop[0].hooks[0].command).toBe('notify-send done');
    expect(existsSync(hooks.script)).toBe(true);
    expect(hooks.repoint(old)).toBe(false);
  });
});
