import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Common dev-server ports, in the order we try them. */
const PORTS = [3000, 3001, 5173, 5174, 4321, 4200, 8080, 8000];
const HOSTS = ['127.0.0.1', '[::1]'];

async function respondsWithHtml(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(500), redirect: 'manual' });
    const type = res.headers.get('content-type') ?? '';
    return type.includes('text/html') || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

/** Find a running local dev server. Returns a http://localhost:PORT URL or null. */
export async function detectLocalServer(): Promise<string | null> {
  // In `pnpm dev`, Kinglet's own UI is served by Vite: never pick that one.
  const ownPort = process.env.ELECTRON_RENDERER_URL ? Number(new URL(process.env.ELECTRON_RENDERER_URL).port) : null;
  const checks = PORTS.filter((port) => port !== ownPort).map(async (port) => {
    for (const host of HOSTS) if (await respondsWithHtml(`http://${host}:${port}/`)) return port;
    return null;
  });
  for (const port of await Promise.all(checks)) if (port) return `http://localhost:${port}/`;
  return null;
}

/** Every local dev server that answers with a page, with the project folder when it can be found. */
export async function detectLocalServers(): Promise<{ url: string; port: number; folder: string | null }[]> {
  const ownPort = process.env.ELECTRON_RENDERER_URL ? Number(new URL(process.env.ELECTRON_RENDERER_URL).port) : null;
  const found = await Promise.all(
    PORTS.filter((port) => port !== ownPort).map(async (port) => {
      for (const host of HOSTS) if (await respondsWithHtml(`http://${host}:${port}/`)) return port;
      return null;
    }),
  );
  return found.filter((p): p is number => !!p).map((port) => ({ url: `http://localhost:${port}/`, port, folder: folderOfPort(port) }));
}

/**
 * Linux: the folder of the process listening on a port (its working directory, then up to the
 * nearest package.json). /proc/net/tcp gives the socket inode, /proc/<pid>/fd the process.
 */
export function folderOfPort(port: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    const hex = port.toString(16).toUpperCase().padStart(4, '0');
    const inodes = new Set<string>();
    for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
      let text = '';
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n').slice(1)) {
        const cols = line.trim().split(/\s+/);
        // local_address is "ADDR:PORT", st 0A = LISTEN
        if (cols[1]?.endsWith(`:${hex}`) && cols[3] === '0A' && cols[9]) inodes.add(cols[9]);
      }
    }
    if (!inodes.size) return null;
    for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      let fds: string[];
      try {
        fds = readdirSync(`/proc/${pid}/fd`);
      } catch {
        continue;
      }
      for (const fd of fds) {
        let target = '';
        try {
          target = readlinkSync(`/proc/${pid}/fd/${fd}`);
        } catch {
          continue;
        }
        const m = /^socket:\[(\d+)\]$/.exec(target);
        if (m && inodes.has(m[1]!)) return projectRoot(readlinkSync(`/proc/${pid}/cwd`));
      }
    }
  } catch {
    /* no access: unknown */
  }
  return null;
}

/** The nearest folder with a package.json, from a path up. */
function projectRoot(dir: string): string {
  let d = dir;
  while (d !== dirname(d)) {
    if (existsSync(join(d, 'package.json'))) return d;
    d = dirname(d);
  }
  return dir;
}
