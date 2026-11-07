import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { CONTROL_FILE, CWD_HEADER, type AppShot, type AppStatus, type ControlFile } from '@kinglet/mcp';
import { t } from '@kinglet/core';
import type { McpActivity } from '../shared/types';
import type { DeviceManager } from './devices';

interface Deps {
  devices: DeviceManager;
  version: string;
  userData: string;
  /** Analysis of a page; with `projectId`, of a project not on screen: rendered off screen, the devices don't move. */
  analyze(url: string, projectId?: string): Promise<unknown>;
  /**
   * The project of a Claude session (from the folder it runs in) when it is not the one on screen: its MCP calls must
   * not move the devices the person is looking at. Null for the project on screen, or a folder outside every project.
   */
  background?(cwd: string): { id: string; name: string; url: string | null } | null;
  /** Remember the page of a project not on screen (open_url from its Claude). */
  remember?(projectId: string, url: string): void;
  setActive(ids: string[]): void;
  navigate(url: string): Promise<void>;
  onActivity(a: McpActivity): void;
  deployments(projectId?: string): { project: unknown; deployments: unknown[] };
  logs(): unknown;
  /** A Claude Code hook event (see claude-hooks.ts). */
  onClaudeEvent?(payload: Record<string, unknown>): void;
  /** Claude (in the panel) wants to run a tool: ask the user; resolves with the answer. */
  approve?(req: { tool: string; input: Record<string, unknown>; chat: string | null }): Promise<{ allow: boolean; message?: string }>;
  /** The server listens: where to reach it. */
  onListen?(port: number, token: string): void;
}

/** Hook payloads carry tool output (whole files): accept big bodies, within reason. */
const MAX_BODY = 32 * 1024 * 1024;

/** Device pixels are big (iPhone: 1179×2556). Half of that is plenty for Claude to look at. */
const SHOT_SCALE = 0.5;

/**
 * Local HTTP control server for the MCP bridge (packages/mcp).
 * Listens on 127.0.0.1 only, on a random port, and requires a random token written
 * to ~/.config/Kinglet/mcp.json (readable by the current user only).
 */
export function startControlServer(deps: Deps) {
  const token = randomBytes(24).toString('hex');
  const file = join(deps.userData, CONTROL_FILE);
  const expected = Buffer.from(`Bearer ${token}`);

  const status = (): AppStatus => ({
    url: deps.devices.currentUrl,
    version: deps.version,
    devices: deps.devices.entries().map((d) => ({ id: d.preset.id, label: d.preset.label, kind: d.preset.kind, ...deps.devices.viewport(d.preset) })),
  });

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let raw = '';
      req.on('data', (c) => {
        if (raw.length < MAX_BODY) raw += c;
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(res, 401, { error: 'unauthorized' });

    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      // A Claude working on another project than the one on screen: never touch the visible devices for it.
      const rawCwd = req.headers[CWD_HEADER];
      let cwd: string | null = null;
      try {
        cwd = typeof rawCwd === 'string' && rawCwd ? decodeURIComponent(rawCwd) : null;
      } catch {
        /* malformed: treated as unknown */
      }
      const bg = cwd ? (deps.background?.(cwd) ?? null) : null;
      const bgStatus = (): AppStatus => ({ ...status(), url: bg!.url, background: bg!.name });
      switch (`${req.method} ${req.url}`) {
        case 'GET /status':
          return send(res, 200, bg ? bgStatus() : status());
        case 'GET /logs':
          if (bg)
            return send(res, 409, {
              error: t(
                `The “${bg.name}” project isn’t on screen in Kinglet: its console isn’t captured. Ask the person to open its tab, or check the page with run_checks.`,
                `Le projet « ${bg.name} » n’est pas affiché dans Kinglet : sa console n’est pas capturée. Demande à la personne d’ouvrir son onglet, ou vérifie la page avec run_checks.`,
              ),
            });
          return send(res, 200, deps.logs());
        case 'GET /deployments':
          return send(res, 200, deps.deployments(bg?.id));
        case 'POST /activity': {
          // Reported by the MCP server once per tool or prompt call.
          deps.onActivity({ at: Date.now(), tool: String(body.tool ?? '?'), ok: body.ok !== false, detail: String(body.detail ?? ''), ms: Number(body.ms ?? 0) });
          return send(res, 200, { ok: true });
        }
        case 'POST /approve': {
          if (!deps.approve) return send(res, 200, { allow: false, message: 'no approver' });
          const answer = await deps.approve({ tool: String(body.tool ?? '?'), input: (body.input ?? {}) as Record<string, unknown>, chat: typeof body.chat === 'string' ? body.chat : null });
          return send(res, 200, answer);
        }
        case 'POST /claude-event': {
          deps.onClaudeEvent?.(body);
          return send(res, 200, { ok: true });
        }
        case 'POST /navigate': {
          const url = String(body.url ?? '');
          if (!/^https?:\/\//.test(url)) return send(res, 400, { error: t('invalid url', 'url invalide') });
          if (bg) {
            deps.remember?.(bg.id, url);
            bg.url = url;
            return send(res, 200, bgStatus());
          }
          await deps.navigate(url);
          return send(res, 200, status());
        }
        case 'POST /devices': {
          const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
          deps.setActive(ids);
          return send(res, 200, status());
        }
        case 'POST /analyze': {
          if (bg) {
            const url = typeof body.url === 'string' && body.url ? body.url : bg.url;
            if (!url) return send(res, 400, { error: t('no page open', 'aucune page ouverte') });
            return send(res, 200, await deps.analyze(url, bg.id));
          }
          const url = typeof body.url === 'string' && body.url ? body.url : deps.devices.currentUrl;
          if (!url) return send(res, 400, { error: t('no page open', 'aucune page ouverte') });
          // Rendered measures come from the devices: they must show the page analysed.
          if (url !== deps.devices.currentUrl) await deps.navigate(url);
          const report = await deps.analyze(url);
          return send(res, 200, report);
        }
        case 'POST /screenshot': {
          const only = typeof body.device === 'string' ? body.device : null;
          const selector = typeof body.selector === 'string' && body.selector ? body.selector : undefined;
          const y = typeof body.scrollY === 'number' ? body.scrollY : undefined;
          const shots: AppShot[] = [];
          const missing: string[] = [];
          if (bg) {
            // Off screen, at the device's size: scrolling to an element isn't available there.
            if (!bg.url) return send(res, 400, { error: t('no page open', 'aucune page ouverte') });
            for (const d of deps.devices.entries()) {
              if (only && d.preset.id !== only) continue;
              if (selector || y !== undefined) missing.push(d.preset.label);
              const snap = await deps.devices.snapshot(bg.url, d.preset.id);
              const data = snap.image?.replace(/^data:image\/png;base64,/, '');
              if (data) shots.push({ id: d.preset.id, label: d.preset.label, mime: 'image/png', data, ...deps.devices.viewport(d.preset) });
            }
            return send(res, 200, { shots, missing });
          }
          for (const d of deps.devices.entries()) {
            if (only && d.preset.id !== only) continue;
            if ((selector || y !== undefined) && !(await deps.devices.scrollTo(d.preset.id, { selector, y }))) missing.push(d.preset.label);
            const data = await deps.devices.capture(d.preset.id, SHOT_SCALE);
            if (data) shots.push({ id: d.preset.id, label: d.preset.label, mime: 'image/jpeg', data, ...deps.devices.viewport(d.preset) });
          }
          return send(res, 200, { shots, missing });
        }
        default:
          return send(res, 404, { error: 'not found' });
      }
    } catch (e) {
      return send(res, 500, { error: (e as Error).message });
    }
  });

  // An approval waits for the user (up to 30 min): no default 5-minute request timeout.
  server.requestTimeout = 35 * 60_000;
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return;
    const info: ControlFile = { port: address.port, token, pid: process.pid, version: deps.version };
    mkdirSync(deps.userData, { recursive: true });
    writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
    deps.onListen?.(address.port, token);
  });

  return {
    close() {
      server.close();
      rmSync(file, { force: true });
    },
  };
}
