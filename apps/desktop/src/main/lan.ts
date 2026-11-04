import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { getLanguage, t } from '@parakeet/core';

/**
 * "On my phone": a reverse proxy on the local network (0.0.0.0) to the local dev server.
 *
 * - Pairing: only a device that opened the QR code's URL (secret token → cookie) gets the site;
 *   anyone else on the Wi-Fi gets a 403.
 * - Dev servers check Host/Origin (Vite allowedHosts, Next allowedDevOrigins): they are rewritten
 *   to the target, so the phone is seen as localhost. WebSocket upgrades (hot reload) go through.
 * - Optional "follow": a small script injected in HTML pages follows Parakeet's navigation.
 */

export interface LanAddress {
  address: string;
  iface: string;
}

export interface LanClient {
  id: number;
  userAgent: string;
  since: number;
}

const COOKIE = 'parakeet_pair';
const PREFIX = '/__parakeet';
const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL = /^(docker|br-|veth|virbr|vmnet|vboxnet|tailscale|zt|wg|lo)/;

/** IPv4 addresses a phone could reach: physical private networks first. */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [iface, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) out.push({ address: a.address, iface });
  }
  const rank = (a: LanAddress) => (VIRTUAL.test(a.iface) ? 2 : PRIVATE.test(a.address) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0b;color:#a1a1aa;font:16px system-ui;text-align:center;padding:24px;box-sizing:border-box">
<div style="max-width:340px"><div style="color:#ededef;font-weight:600;font-size:18px;margin-bottom:10px">${title}</div>${body}</div></body></html>`;

const FOLLOW_JS = `(() => {
  if (window.__parakeetFollow) return;
  window.__parakeetFollow = true;
  const es = new EventSource('${PREFIX}/events');
  es.addEventListener('navigate', (e) => {
    const path = e.data;
    if (path && path !== location.pathname + location.search) location.assign(path);
  });
})();`;

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export class LanProxy {
  private server: Server | null = null;
  private token = randomBytes(18).toString('base64url');
  private clients = new Map<number, { res: ServerResponse; info: LanClient }>();
  private nextId = 1;
  port: number | null = null;
  follow = true;
  private lastPath: string | null = null;

  constructor(
    /** Origin of the local dev server (http://localhost:5173), or null when none is open. */
    private target: () => string | null,
    private onClients: (clients: LanClient[]) => void = () => undefined,
  ) {}

  get running() {
    return !!this.server;
  }

  /** Start on the preferred port, or the next free ones. A new pairing token every time. */
  async start(preferred = 47800): Promise<number> {
    if (this.server) return this.port!;
    this.token = randomBytes(18).toString('base64url');
    const server = createServer((req, res) => void this.handle(req, res));
    server.on('upgrade', (req, socket, head) => this.upgrade(req, socket as Socket, head));
    for (let port = preferred; port < preferred + 20; port++) {
      const ok = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(port, '0.0.0.0', () => resolve(true));
      });
      if (ok) {
        this.server = server;
        this.port = port;
        return port;
      }
    }
    throw new Error(t(`no free port between ${preferred} and ${preferred + 19}`, `aucun port libre entre ${preferred} et ${preferred + 19}`));
  }

  stop() {
    for (const { res } of this.clients.values()) res.end();
    this.clients.clear();
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = null;
    this.port = null;
    this.onClients([]);
  }

  /** URL to put in the QR code: pairs the phone, then opens `path`. */
  pairUrl(address: string, path = '/'): string {
    return `http://${address}:${this.port}${PREFIX}/pair?t=${this.token}&next=${encodeURIComponent(path)}`;
  }

  /** Parakeet moved to another page: paired phones that follow go there too. */
  notify(path: string) {
    this.lastPath = path;
    if (!this.follow) return;
    for (const { res } of this.clients.values()) res.write(`event: navigate\ndata: ${path}\n\n`);
  }

  private paired(req: IncomingMessage): boolean {
    const got = Buffer.from(readCookie(req, COOKIE) ?? '');
    const want = Buffer.from(this.token);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');

    if (url.pathname === `${PREFIX}/pair`) {
      if (url.searchParams.get('t') !== this.token) {
        res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(page(t('QR code expired', 'QR code expiré'), t('Reopen “On my phone” in Parakeet and scan the new code.', 'Rouvre « Sur mon téléphone » dans Parakeet et scanne le nouveau code.')));
      }
      const next = url.searchParams.get('next') ?? '/';
      res.writeHead(302, { 'set-cookie': `${COOKIE}=${this.token}; Path=/; HttpOnly; SameSite=Lax`, location: next.startsWith('/') ? next : '/' });
      return res.end();
    }

    if (!this.paired(req)) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page(t('Device not paired', 'Appareil non appairé'), t('To view this site, scan the QR code in Parakeet (“On my phone” button).', 'Pour voir ce site, scanne le QR code dans Parakeet (bouton « Sur mon téléphone »).')));
    }

    if (url.pathname === `${PREFIX}/follow.js`) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(FOLLOW_JS);
    }
    if (url.pathname === `${PREFIX}/events`) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': parakeet\n\n');
      const id = this.nextId++;
      this.clients.set(id, { res, info: { id, userAgent: String(req.headers['user-agent'] ?? ''), since: Date.now() } });
      this.onClients([...this.clients.values()].map((c) => c.info));
      if (this.follow && this.lastPath) res.write(`event: navigate\ndata: ${this.lastPath}\n\n`);
      req.on('close', () => {
        this.clients.delete(id);
        this.onClients([...this.clients.values()].map((c) => c.info));
      });
      return;
    }

    const targetOrigin = this.target();
    if (!targetOrigin) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page(t('No local server', 'Aucun serveur local'), t('Open your local site in Parakeet.', 'Ouvre ton site en local dans Parakeet.')));
    }
    this.proxy(req, res, new URL(targetOrigin));
  }

  /** Headers as the dev server expects them from a browser on localhost. */
  private forwardHeaders(req: IncomingMessage, target: URL, html: boolean) {
    const proxyOrigin = `http://${req.headers.host}`;
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP.has(k)) headers[k] = v;
    headers.host = target.host;
    for (const k of ['origin', 'referer']) {
      const v = headers[k];
      if (typeof v === 'string' && v.startsWith(proxyOrigin)) headers[k] = target.origin + v.slice(proxyOrigin.length);
    }
    // Do not forward the pairing cookie to the site.
    if (typeof headers.cookie === 'string') headers.cookie = headers.cookie.split(';').filter((c) => !c.trim().startsWith(`${COOKIE}=`)).join(';');
    if (html) headers['accept-encoding'] = 'identity'; // HTML is rewritten (follow script)
    return headers;
  }

  private proxy(req: IncomingMessage, res: ServerResponse, target: URL) {
    const wantsHtml = req.method === 'GET' && (req.headers['sec-fetch-dest'] === 'document' || (req.headers.accept ?? '').includes('text/html'));
    const upstream = httpRequest(
      { host: target.hostname, port: target.port || 80, method: req.method, path: req.url, headers: this.forwardHeaders(req, target, wantsHtml) },
      (up) => {
        const headers = { ...up.headers };
        for (const k of HOP) delete headers[k];
        // Redirects to the dev server's own origin stay on the proxy.
        const loc = headers.location;
        if (typeof loc === 'string' && loc.startsWith(target.origin)) headers.location = loc.slice(target.origin.length) || '/';
        const isHtml = wantsHtml && String(headers['content-type'] ?? '').includes('text/html') && !headers['content-encoding'];
        if (!isHtml) {
          res.writeHead(up.statusCode ?? 502, headers);
          return up.pipe(res);
        }
        const chunks: Buffer[] = [];
        up.on('data', (c: Buffer) => chunks.push(c));
        up.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          const tag = `<script src="${PREFIX}/follow.js" defer></script>`;
          body = /<\/head>/i.test(body) ? body.replace(/<\/head>/i, `${tag}</head>`) : body + tag;
          delete headers['content-length'];
          res.writeHead(up.statusCode ?? 200, { ...headers, 'content-length': Buffer.byteLength(body) });
          res.end(body);
        });
      },
    );
    upstream.on('error', () => {
      if (res.headersSent) return res.end();
      res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page(t('The dev server is not responding', 'Le serveur de dev ne répond pas'), t(`${target.host} is not responding. It may have been stopped.`, `${target.host} ne répond pas. Il a peut-être été arrêté.`)));
    });
    req.pipe(upstream);
  }

  /** WebSocket (hot reload): same pairing check and header rewrite, then raw pipes. */
  private upgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const targetOrigin = this.target();
    if (!this.paired(req) || !targetOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const target = new URL(targetOrigin);
    const upstream = connect(Number(target.port || 80), target.hostname, () => {
      const headers = this.forwardHeaders(req, target, false);
      const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `${k}: ${x}`) : [`${k}: ${v}`])), 'connection: Upgrade', `upgrade: ${req.headers.upgrade}`];
      upstream.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      socket.destroy();
    };
    upstream.on('error', close);
    socket.on('error', close);
  }
}
