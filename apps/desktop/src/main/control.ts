import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { CONTROL_FILE, type AppShot, type AppStatus, type ControlFile } from '@parakeet/mcp';
import type { McpActivity } from '../shared/types';
import type { DeviceManager } from './devices';

interface Deps {
  devices: DeviceManager;
  version: string;
  userData: string;
  analyze(url: string): Promise<unknown>;
  setActive(ids: string[]): void;
  navigate(url: string): Promise<void>;
  onActivity(a: McpActivity): void;
  deployments(): { project: unknown; deployments: unknown[] };
  logs(): unknown;
  /** A Claude Code hook event (see claude-hooks.ts). */
  onClaudeEvent?(payload: Record<string, unknown>): void;
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
 * to ~/.config/Parakeet/mcp.json (readable by the current user only).
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
      switch (`${req.method} ${req.url}`) {
        case 'GET /status':
          return send(res, 200, status());
        case 'GET /logs':
          return send(res, 200, deps.logs());
        case 'GET /deployments':
          return send(res, 200, deps.deployments());
        case 'POST /activity': {
          // Reported by the MCP server once per tool or prompt call.
          deps.onActivity({ at: Date.now(), tool: String(body.tool ?? '?'), ok: body.ok !== false, detail: String(body.detail ?? ''), ms: Number(body.ms ?? 0) });
          return send(res, 200, { ok: true });
        }
        case 'POST /claude-event': {
          deps.onClaudeEvent?.(body);
          return send(res, 200, { ok: true });
        }
        case 'POST /navigate': {
          const url = String(body.url ?? '');
          if (!/^https?:\/\//.test(url)) return send(res, 400, { error: 'url invalide' });
          await deps.navigate(url);
          return send(res, 200, status());
        }
        case 'POST /devices': {
          const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
          deps.setActive(ids);
          return send(res, 200, status());
        }
        case 'POST /analyze': {
          const url = typeof body.url === 'string' && body.url ? body.url : deps.devices.currentUrl;
          if (!url) return send(res, 400, { error: 'aucune page ouverte' });
          // Rendered measures come from the devices: they must show the page analysed.
          if (url !== deps.devices.currentUrl) await deps.navigate(url);
          const report = await deps.analyze(url);
          return send(res, 200, report);
        }
        case 'POST /screenshot': {
          const only = typeof body.device === 'string' ? body.device : null;
          const shots: AppShot[] = [];
          for (const d of deps.devices.entries()) {
            if (only && d.preset.id !== only) continue;
            const data = await deps.devices.capture(d.preset.id, SHOT_SCALE);
            if (data) shots.push({ id: d.preset.id, label: d.preset.label, mime: 'image/jpeg', data, ...deps.devices.viewport(d.preset) });
          }
          return send(res, 200, { shots });
        }
        default:
          return send(res, 404, { error: 'not found' });
      }
    } catch (e) {
      return send(res, 500, { error: (e as Error).message });
    }
  });

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
