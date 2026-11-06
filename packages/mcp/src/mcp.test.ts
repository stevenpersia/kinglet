import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTROL_FILE } from './control.ts';

type ToolResult = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };

let site: Server;
let siteUrl = '';
let dir = '';

beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html lang="fr"><head><title>Accueil — Maison Sable</title><meta name="viewport" content="width=device-width"><meta property="og:title" content="Maison Sable"><script type="module" src="/@vite/client"></script></head><body><h1>Hi</h1><a href="/atelier">Atelier</a></body></html>`);
    } else if (req.url === '/atelier') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Atelier</title></head><body></body></html>');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  dir = mkdtempSync(join(tmpdir(), 'kinglet-mcp-'));
});

afterAll(() => {
  site.close();
  rmSync(dir, { recursive: true, force: true });
});

async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(__dirname, 'cli.ts')],
    env: { ...process.env, KINGLET_CONFIG_DIR: dir } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? '').join('\n');

describe('MCP server, app closed (headless)', () => {
  it('lists the tools and the prompts', async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(['approve', 'audit_site', 'get_accessibility', 'get_console', 'get_page_meta', 'get_share_preview', 'get_structured_data', 'list_deployments', 'list_pages', 'open_url', 'run_checks', 'screenshot', 'set_devices', 'status']);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    expect(prompts).toEqual(['fix_accessibility', 'fix_checks', 'fix_console', 'fix_open_graph', 'fix_site']);
    await client.close();
  });

  it('works on a given URL without the app', async () => {
    const client = await connect();
    expect(textOf(await call(client, 'status'))).toMatch(/is not open/);
    const meta = JSON.parse(textOf(await call(client, 'get_page_meta', { url: siteUrl })));
    expect(meta).toMatchObject({ title: 'Accueil — Maison Sable', framework: 'vite' });
    const checks = textOf(await call(client, 'run_checks', { url: siteUrl }));
    expect(checks).toMatch(/Checks for .*: \d+\/\d+ \(without measures in the devices/);
    const share = textOf(await call(client, 'get_share_preview', { url: siteUrl, platform: 'slack' }));
    expect(share).toMatch(/Slack/);
    expect(share).toMatch(/og:site_name/);
    expect(share).not.toMatch(/WhatsApp/);
    expect(textOf(await call(client, 'list_pages', { url: siteUrl }))).toMatch(/200 {2}\/atelier/);
    const shot = await call(client, 'screenshot');
    expect(shot.isError).toBe(true);
    const prompt = await client.getPrompt({ name: 'fix_open_graph', arguments: { url: siteUrl } });
    expect((prompt.messages[0]!.content as { text: string }).text).toMatch(/og:site_name[\s\S]*get_share_preview/);
    await client.close();
  });
});

describe('MCP server, app open', () => {
  let control: Server;
  const calls: string[] = [];

  beforeAll(async () => {
    const status = { url: siteUrl, version: '0.0.1', devices: [{ id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, kind: 'phone' }] };
    control = createServer((req, res) => {
      if (req.headers.authorization !== 'Bearer secret') {
        res.writeHead(401);
        return res.end('{"error":"unauthorized"}');
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        // The answer depends on the command: read the body first.
        if (req.url === '/approve') return res.end(JSON.stringify(body.includes('rm -rf') ? { allow: false, message: 'no' } : { allow: true }));
        if (req.url === '/activity') calls.push(`activity ${JSON.parse(body).tool}`);
        else calls.push(`${req.method} ${req.url}`);
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/screenshot') res.end(JSON.stringify({ shots: [{ id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, mime: 'image/jpeg', data: 'aGVsbG8=' }] }));
      else if (req.url === '/analyze') res.end(JSON.stringify({ url: siteUrl, checks: [{ id: 'overflow', group: 'mobile', label: 'Horizontal overflow', status: 'error', detail: 'iPhone 16: +120 px' }] }));
      else if (req.url === '/activity') res.end('{"ok":true}');
      else if (req.url === '/approve') return;
      else if (req.url === '/deployments')
        res.end(JSON.stringify({ project: { name: 'maison-sable', productionUrl: 'https://maisonsable.fr' }, deployments: [{ id: 'd1', url: 'https://maison-sable-git-feat-hero.vercel.app', state: 'READY', production: false, createdAt: Date.now() - 120_000, branch: 'feat/hero', commitMessage: 'hero: nouveau titre', author: 'claude' }] }));
      else res.end(JSON.stringify(status));
    });
    await new Promise<void>((r) => control.listen(0, '127.0.0.1', r));
    const port = (control.address() as { port: number }).port;
    writeFileSync(join(dir, CONTROL_FILE), JSON.stringify({ port, token: 'secret', pid: process.pid, version: '0.0.1' }));
  });

  afterAll(() => {
    control.close();
    rmSync(join(dir, CONTROL_FILE), { force: true });
  });

  it('uses the page open in the app and its devices', async () => {
    const client = await connect();
    expect(textOf(await call(client, 'status'))).toMatch(/iPhone 16 \(iphone-16, 393×852\)/);
    const shot = await call(client, 'screenshot');
    expect(shot.content.find((c) => c.type === 'image')).toMatchObject({ data: 'aGVsbG8=', mimeType: 'image/jpeg' });
    expect(textOf(await call(client, 'run_checks'))).toMatch(/✗ \[mobile\] Horizontal overflow: iPhone 16: \+120 px/);
    expect(textOf(await call(client, 'list_deployments'))).toMatch(/READY\s+preview feat\/hero · hero: nouveau titre · claude · 2 min ago\n\s+https:\/\/maison-sable-git-feat-hero\.vercel\.app/);
    const meta = JSON.parse(textOf(await call(client, 'get_page_meta')));
    expect(meta.url).toBe(siteUrl);
    // One activity report per call, after the work.
    expect(calls.filter((c) => c.startsWith('activity'))).toEqual(['activity status', 'activity screenshot', 'activity run_checks', 'activity list_deployments', 'activity get_page_meta']);
    expect(calls).toEqual(expect.arrayContaining(['POST /screenshot', 'POST /analyze']));
    await client.close();
  });

  it('answers Claude Code’s permission prompts with what the user chose in the app', async () => {
    const client = await connect();
    const ok = JSON.parse(textOf(await call(client, 'approve', { tool_name: 'Bash', input: { command: 'npm install zod' } })));
    expect(ok).toEqual({ behavior: 'allow', updatedInput: { command: 'npm install zod' } });
    const no = JSON.parse(textOf(await call(client, 'approve', { tool_name: 'Bash', input: { command: 'rm -rf /' } })));
    expect(no).toEqual({ behavior: 'deny', message: 'no' });
    await client.close();
  });
});
