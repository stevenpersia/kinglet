import type { ConsoleEntry } from '@kinglet/core';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The running Kinglet app exposes a small HTTP control server on 127.0.0.1.
 * It writes where to find it (port + secret token) in its config folder.
 */
export interface ControlFile {
  port: number;
  token: string;
  pid: number;
  version: string;
}

export interface AppDevice {
  id: string;
  label: string;
  width: number;
  height: number;
  kind: string;
}

export interface AppStatus {
  url: string | null;
  devices: AppDevice[];
  version: string;
}

export interface AppShot {
  id: string;
  label: string;
  width: number;
  height: number;
  mime: string;
  /** base64 */
  data: string;
}

export const CONTROL_FILE = 'mcp.json';

export interface Deployment {
  id: string;
  url: string;
  state: string;
  production: boolean;
  createdAt: number;
  branch: string | null;
  commitMessage: string | null;
  author: string | null;
}

/** One MCP tool or prompt call, reported to the app. */
export interface Activity {
  tool: string;
  ok: boolean;
  detail: string;
  ms: number;
}

/** ~/.config/Kinglet on Linux (or $XDG_CONFIG_HOME/Kinglet), overridable for tests. */
export function configDir(): string {
  if (process.env.KINGLET_CONFIG_DIR) return process.env.KINGLET_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'Kinglet');
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class AppControl {
  private file: ControlFile;
  private constructor(file: ControlFile) {
    this.file = file;
  }

  /** Connect to the running app, or null when it is not open. */
  static async connect(dir = configDir()): Promise<AppControl | null> {
    let file: ControlFile;
    try {
      file = JSON.parse(readFileSync(join(dir, CONTROL_FILE), 'utf8'));
    } catch {
      return null;
    }
    if (!alive(file.pid)) return null;
    const c = new AppControl(file);
    try {
      await c.status();
      return c;
    } catch {
      return null;
    }
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    const res = await fetch(`http://127.0.0.1:${this.file.port}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.file.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }

  status() {
    return this.call<AppStatus>('GET', '/status', undefined, 3000);
  }
  navigate(url: string) {
    return this.call<AppStatus>('POST', '/navigate', { url });
  }
  setDevices(ids: string[]) {
    return this.call<AppStatus>('POST', '/devices', { ids });
  }
  analyze<T>(url: string | null) {
    return this.call<T>('POST', '/analyze', { url }, 60_000);
  }
  screenshot(device: string | null, to: { selector?: string; scrollY?: number } = {}) {
    return this.call<{ shots: AppShot[]; missing?: string[] }>('POST', '/screenshot', { device, ...to });
  }
  logs() {
    return this.call<{ url: string | null; throttle: { network: string; cpu: number }; logs: ConsoleEntry[] }>('GET', '/logs');
  }

  deployments() {
    return this.call<{ project: { name: string; productionUrl: string | null } | null; deployments: Deployment[] }>('GET', '/deployments');
  }
  /** Ask the person in front of Kinglet whether Claude may use a tool (waits for the answer). */
  approve(req: { tool: string; input: unknown; chat: string | null }) {
    return this.call<{ allow: boolean; message?: string }>('POST', '/approve', req, 30 * 60_000);
  }
  /** Tell the app what Claude just did (shown in its MCP activity). */
  report(activity: Activity) {
    return this.call<{ ok: true }>('POST', '/activity', activity, 3000);
  }
}
