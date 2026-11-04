import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The running Parakeet app exposes a small HTTP control server on 127.0.0.1.
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

/** One MCP tool or prompt call, reported to the app. */
export interface Activity {
  tool: string;
  ok: boolean;
  detail: string;
  ms: number;
}

/** ~/.config/Parakeet on Linux (or $XDG_CONFIG_HOME/Parakeet), overridable for tests. */
export function configDir(): string {
  if (process.env.PARAKEET_CONFIG_DIR) return process.env.PARAKEET_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'Parakeet');
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
  screenshot(device: string | null) {
    return this.call<{ shots: AppShot[] }>('POST', '/screenshot', { device });
  }
  /** Tell the app what Claude just did (shown in its MCP activity). */
  report(activity: Activity) {
    return this.call<{ ok: true }>('POST', '/activity', activity, 3000);
  }
}
