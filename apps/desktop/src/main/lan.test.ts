import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lanAddresses, LanProxy, type LanClient } from './lan';

let site: Server;
let target = '';
let seen: IncomingHttpHeaders = {};
let proxy: LanProxy;
let base = '';
let clients: LanClient[] = [];

beforeAll(async () => {
  site = createServer((req, res) => {
    seen = req.headers;
    if (req.url === '/go') {
      res.writeHead(302, { location: `${target}/dest` });
      return res.end();
    }
    if (req.url === '/api') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><head><title>Site</title></head><body>hello</body></html>');
  });
  // Hot reload: a WebSocket-like upgrade that echoes what it receives.
  site.on('upgrade', (req, socket) => {
    seen = req.headers;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(d));
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  target = `http://localhost:${(site.address() as { port: number }).port}`;
  proxy = new LanProxy(() => target, (c) => (clients = c));
  const port = await proxy.start(47900);
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => {
  proxy.stop();
  site.close();
});

const pairCookie = async () => {
  const pair = new URL(proxy.pairUrl('127.0.0.1', '/'));
  const res = await fetch(pair, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie')!.split(';')[0]!;
};

describe('LanProxy', () => {
  it('refuses devices that did not scan the QR code', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/non appairé/);
    expect((await fetch(`${base}/__parakeet/pair?t=wrong`)).status).toBe(403);
  });

  it('pairs with the token, then proxies with localhost headers', async () => {
    const cookie = await pairCookie();
    const res = await fetch(`${base}/api`, { headers: { cookie: `${cookie}; theme=dark`, origin: base } });
    expect(await res.json()).toEqual({ ok: true });
    expect(seen.host).toBe(new URL(target).host);
    expect(seen.origin).toBe(target);
    expect(seen.cookie).toBe('theme=dark'); // the pairing cookie stays with the proxy
  });

  it('injects the follow script in HTML pages and rewrites redirects', async () => {
    const cookie = await pairCookie();
    const html = await (await fetch(`${base}/`, { headers: { cookie, accept: 'text/html' } })).text();
    expect(html).toContain('<script src="/__parakeet/follow.js" defer></script></head>');
    expect(seen['accept-encoding']).toBe('identity');
    const go = await fetch(`${base}/go`, { headers: { cookie }, redirect: 'manual' });
    expect(go.headers.get('location')).toBe('/dest');
  });

  it('passes WebSocket upgrades (hot reload) through, paired only', async () => {
    const cookie = await pairCookie();
    const echo = await new Promise<string>((resolve, reject) => {
      const req = request(`${base}/hmr`, { headers: { cookie, connection: 'Upgrade', upgrade: 'websocket', origin: base } });
      req.on('upgrade', (_res, socket) => {
        socket.on('data', (d) => resolve(d.toString()));
        socket.write('ping');
      });
      req.on('error', reject);
      req.end();
    });
    expect(echo).toBe('ping');
    expect(seen.origin).toBe(target);
    const refused = await new Promise<number>((resolve) => {
      const req = request(`${base}/hmr`, { headers: { connection: 'Upgrade', upgrade: 'websocket' } });
      req.on('response', (r) => resolve(r.statusCode ?? 0));
      req.on('upgrade', () => resolve(101));
      req.on('error', () => resolve(-1));
      req.end();
    });
    expect(refused).toBe(403);
  });

  it('tells following phones where Parakeet goes', async () => {
    const cookie = await pairCookie();
    const ctrl = new AbortController();
    const res = await fetch(`${base}/__parakeet/events`, { headers: { cookie, 'user-agent': 'iPhone test' }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    await reader.read(); // ": parakeet" comment
    expect(clients.map((c) => c.userAgent)).toEqual(['iPhone test']);
    proxy.notify('/atelier?x=1');
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('event: navigate\ndata: /atelier?x=1\n\n');
    ctrl.abort();
  });

  it('lists the machine’s IPv4 addresses', () => {
    expect(lanAddresses().every((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.address))).toBe(true);
  });
});
