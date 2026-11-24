import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArtifactServer, ArtifactStore, artifactFromHook, htmlTitle, servedPath, upsertArtifact } from './artifacts';

const hook = (input: Record<string, unknown>, response: unknown = 'Published the Artifact at https://claude.ai/code/artifact/abc-123 (version 1)') => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Artifact',
  cwd: '/home/me/dev/site',
  tool_input: input,
  tool_response: response,
});

describe('artifactFromHook', () => {
  it('reads a publish: the page (relative to the session folder) and the link from the answer', () => {
    expect(artifactFromHook(hook({ file_path: 'out/pricing.html' }))).toEqual({ file: '/home/me/dev/site/out/pricing.html', url: 'https://claude.ai/code/artifact/abc-123', title: null });
  });
  it('finds the link in a structured answer too', () => {
    expect(artifactFromHook(hook({ file_path: '/tmp/a.html' }, [{ type: 'text', text: 'Updated the Artifact at https://claude.ai/artifact/Xy9' }]))?.url).toBe('https://claude.ai/artifact/Xy9');
  });
  it('keeps an artifact made from a type (no page) by its link', () => {
    expect(artifactFromHook(hook({ type_url: 'https://claude.ai/artifact/type', title: 'Deck' }))).toEqual({ file: null, url: 'https://claude.ai/code/artifact/abc-123', title: 'Deck' });
  });
  it('ignores reads, lists, uploads and other tools', () => {
    expect(artifactFromHook(hook({ action: 'read', url: 'https://claude.ai/artifact/x' }))).toBeNull();
    expect(artifactFromHook(hook({ action: 'quickstart', intent: 'other' }))).toBeNull();
    expect(artifactFromHook(hook({ asset: true, file_path: '/tmp/a.png', url: 'https://claude.ai/artifact/x' }))).toBeNull();
    expect(artifactFromHook({ ...hook({ file_path: '/tmp/a.html' }), tool_name: 'Write' })).toBeNull();
    expect(artifactFromHook({ ...hook({ file_path: '/tmp/a.html' }), hook_event_name: 'PreToolUse' })).toBeNull();
  });
  it('a data file without a link is not a page', () => {
    expect(artifactFromHook(hook({ file_path: '/tmp/canvas.json' }, 'ok'))).toBeNull();
  });
});

describe('upsertArtifact', () => {
  it('adds new ones on top, and counts the versions of the same page', () => {
    let list = upsertArtifact([], { file: '/a.html', url: null, title: null }, 1, 'A', 'a');
    list = upsertArtifact(list, { file: '/b.html', url: null, title: null }, 2, 'B', 'b');
    list = upsertArtifact(list, { file: '/a.html', url: 'https://claude.ai/artifact/1', title: null }, 3, 'A2', 'c');
    expect(list.map((e) => [e.id, e.title, e.version, e.url])).toEqual([
      ['a', 'A2', 2, 'https://claude.ai/artifact/1'],
      ['b', 'B', 1, null],
    ]);
    expect(list[0]!.seen).toBe(false);
  });
});

describe('htmlTitle', () => {
  it('reads and decodes the title', () => {
    expect(htmlTitle('<html><head><title> Tarifs &amp; plans\n</title>')).toBe('Tarifs & plans');
    expect(htmlTitle('<p>none</p>')).toBeNull();
  });
});

describe('servedPath', () => {
  it('stays inside the folder, without hidden files', () => {
    expect(servedPath('/srv/a', 'img/x.png')).toBe('/srv/a/img/x.png');
    expect(servedPath('/srv/a', '../b/secret')).toBeNull();
    expect(servedPath('/srv/a', '%2e%2e/b')).toBeNull();
    expect(servedPath('/srv/a', '.env')).toBeNull();
    expect(servedPath('/srv/a', 'x/.git/config')).toBeNull();
  });
});

describe('ArtifactServer', () => {
  it('serves the page with the picker, the files next to it, and nothing without the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-artifact-'));
    writeFileSync(join(dir, 'page.html'), '<html><head><title>Hi</title></head><body><p>ok</p></body></html>');
    writeFileSync(join(dir, 'style.css'), 'p{color:red}');
    writeFileSync(join(dir, '.env'), 'SECRET=1');
    const store = new ArtifactStore(dir);
    const entry = store.add('p1', { file: join(dir, 'page.html'), url: null, title: null });
    expect(entry.title).toBe('Hi');
    const server = new ArtifactServer((id) => store.find(id));
    try {
      const url = (await server.urlOf(entry.id))!;
      const page = await fetch(url);
      expect(page.headers.get('content-type')).toContain('text/html');
      const html = await page.text();
      expect(html).toContain('<p>ok</p>');
      expect(html).toContain("kinglet:'picked'");
      expect(await (await fetch(url.replace(/[^/]+$/, 'style.css'))).text()).toBe('p{color:red}');
      expect((await fetch(url.replace(/[^/]+$/, '.env'))).status).toBe(404);
      expect((await fetch(url.replace(/\/[0-9a-f]{32}\//, '/0000/'))).status).toBe(404);
    } finally {
      server.stop();
    }
  });
});
