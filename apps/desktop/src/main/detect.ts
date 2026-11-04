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
  // In `pnpm dev`, Parakeet's own UI is served by Vite: never pick that one.
  const ownPort = process.env.ELECTRON_RENDERER_URL ? Number(new URL(process.env.ELECTRON_RENDERER_URL).port) : null;
  const checks = PORTS.filter((port) => port !== ownPort).map(async (port) => {
    for (const host of HOSTS) if (await respondsWithHtml(`http://${host}:${port}/`)) return port;
    return null;
  });
  for (const port of await Promise.all(checks)) if (port) return `http://localhost:${port}/`;
  return null;
}
