import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { getLanguage, t } from '@kinglet/core';
import type { FeedbackPin, ReviewState } from '../shared/types';
import { lanAddresses } from './lan';

/**
 * Review link: a client opens it in any browser (no app, no account), sees the pins with their
 * captures, answers them and pins new comments on a capture of each device. Everything lands in
 * the project's Feedback panel. The server listens on the local network (like "On my phone");
 * behind a tunnel, the public address set in the settings makes the link work anywhere.
 */

interface Shot {
  id: string;
  label: string;
  width: number;
  height: number;
}

interface Session {
  projectId: string;
  token: string;
  name: string;
  url: string;
  shots: Shot[];
  createdAt: number;
}

interface Deps {
  dir: string;
  loadPins(projectId: string): FeedbackPin[];
  savePins(projectId: string, pins: FeedbackPin[]): void;
  publicUrl(): string | null;
  onChange(state: ReviewState): void;
}

const MAX_BODY = 64 * 1024;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class ReviewServer {
  private server: Server | null = null;
  private port: number | null = null;
  private sessions: Session[] = [];
  private file: string;

  constructor(private deps: Deps) {
    this.file = join(deps.dir, 'sessions.json');
    try {
      this.sessions = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      this.sessions = [];
    }
    if (this.sessions.length) void this.start().catch(() => undefined);
  }

  state(): ReviewState {
    const base = this.base();
    return {
      running: !!this.server,
      links: Object.fromEntries(this.sessions.map((s) => [s.projectId, base ? `${base}/r/${s.token}` : null])),
      localOnly: !this.deps.publicUrl(),
    };
  }

  private base(): string | null {
    const pub = this.deps.publicUrl()?.trim().replace(/\/+$/, '');
    if (pub) return pub;
    const address = lanAddresses()[0]?.address;
    return this.port && address ? `http://${address}:${this.port}` : null;
  }

  /** Open (or refresh) the review of a project with a capture of each device. */
  async open(projectId: string, name: string, url: string, shots: (Shot & { jpeg: Buffer })[]): Promise<ReviewState> {
    let s = this.sessions.find((x) => x.projectId === projectId);
    if (!s) {
      s = { projectId, token: randomBytes(18).toString('base64url'), name, url, shots: [], createdAt: Date.now() };
      this.sessions.push(s);
    }
    const dir = join(this.deps.dir, s.token);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const sh of shots) writeFileSync(join(dir, `${sh.id.replace(/[^\w-]/g, '_')}.jpg`), sh.jpeg);
    Object.assign(s, { name, url, shots: shots.map(({ jpeg: _j, ...rest }) => rest) });
    this.persist();
    await this.start();
    const st = this.state();
    this.deps.onChange(st);
    return st;
  }

  close(projectId: string): ReviewState {
    const s = this.sessions.find((x) => x.projectId === projectId);
    if (s) rmSync(join(this.deps.dir, s.token), { recursive: true, force: true });
    this.sessions = this.sessions.filter((x) => x.projectId !== projectId);
    this.persist();
    if (!this.sessions.length) this.stop();
    const st = this.state();
    this.deps.onChange(st);
    return st;
  }

  stop() {
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = null;
    this.port = null;
  }

  private persist() {
    mkdirSync(this.deps.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.sessions, null, 2));
  }

  private async start(preferred = 47900) {
    if (this.server) return;
    const server = createServer((req, res) => void this.handle(req, res).catch(() => this.send(res, 500, { error: 'error' })));
    for (let port = preferred; port < preferred + 20; port++) {
      const ok = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(port, '0.0.0.0', () => resolve(true));
      });
      if (ok) {
        this.server = server;
        this.port = port;
        return;
      }
    }
    throw new Error(t('no free port for the review link', 'aucun port libre pour le lien de relecture'));
  }

  private send(res: ServerResponse, code: number, body: unknown, type = 'application/json') {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  private body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > MAX_BODY) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const m = /^\/r\/([\w-]{20,})(\/.*)?$/.exec(url.pathname);
    const s = m ? this.sessions.find((x) => x.token === m[1]) : null;
    if (!s) return this.send(res, 404, page(t('Link expired', 'Lien expiré'), t('This review link is closed.', 'Ce lien de relecture est fermé.')), 'text/html; charset=utf-8');
    const rest = m![2] ?? '/';
    const pins = () => this.deps.loadPins(s.projectId);
    const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

    if (req.method === 'GET' && rest === '/') return this.send(res, 200, reviewPage(s.name), 'text/html; charset=utf-8');
    if (req.method === 'GET' && rest === '/data')
      return this.send(res, 200, {
        name: s.name,
        url: s.url,
        shots: s.shots,
        pins: pins().map(({ image, ...p }) => ({ ...p, hasImage: !!image })),
      });
    let img = /^\/pin\/([\w-]+)\.jpg$/.exec(rest);
    if (req.method === 'GET' && img) {
      const p = pins().find((x) => x.id === img![1]);
      const data = p?.image?.split(',')[1];
      return data ? this.send(res, 200, Buffer.from(data, 'base64'), 'image/jpeg') : this.send(res, 404, {});
    }
    img = /^\/shot\/([\w-]+)\.jpg$/.exec(rest);
    if (req.method === 'GET' && img) {
      try {
        return this.send(res, 200, readFileSync(join(this.deps.dir, s.token, `${img[1]}.jpg`)), 'image/jpeg');
      } catch {
        return this.send(res, 404, {});
      }
    }
    if (req.method === 'POST' && rest === '/reply') {
      const b = await this.body(req);
      const reply = text(b.text, 2000);
      if (!reply) return this.send(res, 400, { error: 'empty' });
      const list = pins();
      const pin = list.find((x) => x.id === b.pinId);
      if (!pin) return this.send(res, 404, {});
      pin.replies = [...(pin.replies ?? []), { author: text(b.author, 60) || t('Client', 'Client'), text: reply, at: Date.now() }];
      this.deps.savePins(s.projectId, list);
      return this.send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && rest === '/pin') {
      const b = await this.body(req);
      const shot = s.shots.find((x) => x.id === b.shotId);
      const comment = text(b.text, 2000);
      const fx = Math.min(1, Math.max(0, Number(b.fx)));
      const fy = Math.min(1, Math.max(0, Number(b.fy)));
      if (!shot || !comment || Number.isNaN(fx) || Number.isNaN(fy)) return this.send(res, 400, { error: 'invalid' });
      const list = pins();
      let jpeg: string | null = null;
      try {
        jpeg = `data:image/jpeg;base64,${readFileSync(join(this.deps.dir, s.token, `${shot.id.replace(/[^\w-]/g, '_')}.jpg`)).toString('base64')}`;
      } catch {
        /* capture gone */
      }
      list.push({
        id: `c${Date.now().toString(36)}${randomBytes(2).toString('hex')}`,
        n: Math.max(0, ...list.map((p) => p.n)) + 1,
        deviceId: shot.id,
        deviceLabel: shot.label,
        url: s.url,
        x: Math.round(fx * shot.width),
        y: Math.round(fy * shot.height),
        fx,
        fy,
        selector: null,
        elementText: null,
        comment,
        image: jpeg,
        createdAt: Date.now(),
        done: false,
        author: text(b.author, 60) || t('Client', 'Client'),
      });
      this.deps.savePins(s.projectId, list);
      return this.send(res, 200, { ok: true });
    }
    return this.send(res, 404, {});
  }
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f6f7;color:#3f3f46;font:16px system-ui;text-align:center;padding:24px"><div><div style="color:#18181b;font-weight:600;font-size:18px;margin-bottom:8px">${esc(title)}</div>${esc(body)}</div></body></html>`;

/** The page the client sees: self-contained, no external resource. */
function reviewPage(name: string): string {
  const L = {
    title: t(`Feedback on ${name}`, `Retours sur ${name}`),
    intro: t('Answer the comments, or click a capture to pin a new one where something should change.', 'Réponds aux commentaires, ou clique sur une capture pour épingler un nouveau retour là où quelque chose doit changer.'),
    name: t('Your name', 'Ton nom'),
    reply: t('Reply', 'Répondre'),
    send: t('Send', 'Envoyer'),
    cancel: t('Cancel', 'Annuler'),
    what: t('What should change here?', 'Qu’est-ce qui doit changer ici ?'),
    comments: t('Comments', 'Commentaires'),
    captures: t('Captures — click to pin a comment', 'Captures — clique pour épingler un retour'),
    none: t('No comment yet.', 'Aucun commentaire pour l’instant.'),
    done: t('done', 'fait'),
    you: t('Team', 'Équipe'),
  };
  return `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(L.title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f6f7;color:#18181b;font:15px/1.45 system-ui,-apple-system,sans-serif}
header{background:#fff;border-bottom:1px solid #e4e4e7;padding:18px 20px}h1{margin:0;font-size:19px}header p{margin:4px 0 0;color:#71717a;font-size:14px}
main{max-width:1100px;margin:0 auto;padding:20px;display:grid;gap:24px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;margin:0 0 10px}
.me{display:flex;gap:8px;align-items:center;font-size:14px;color:#52525b}.me input{width:200px}
input,textarea{font:inherit;border:1px solid #d4d4d8;border-radius:8px;padding:7px 9px;background:#fff;width:100%}textarea{min-height:64px;resize:vertical}
button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:7px 12px;background:#18181b;color:#fff;cursor:pointer}button.ghost{background:#fff;color:#18181b;border:1px solid #d4d4d8}
.pins{display:grid;gap:12px}.pin{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:12px;display:flex;gap:12px}.pin.done{opacity:.55}
.pin img{width:90px;height:150px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid #e4e4e7;flex-shrink:0}
.n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:10px;background:#d97757;color:#fff;font-size:11px;font-weight:700;margin-right:6px}
.meta{font-size:12.5px;color:#71717a}.reply{border-left:2px solid #e4e4e7;padding-left:10px;margin-top:8px;font-size:14px}.reply b{font-size:12.5px}
.shots{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}.shot{display:flex;flex-direction:column;gap:6px;align-items:center}.shot .frame{position:relative;cursor:crosshair}
.shot img{display:block;max-height:560px;max-width:100%;border-radius:10px;box-shadow:0 0 0 1px #e4e4e7,0 8px 24px rgba(0,0,0,.08)}
.dot{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#d97757;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 5px rgba(217,119,87,.3)}
form.new{position:absolute;z-index:2;width:260px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);display:grid;gap:8px}
.row{display:flex;gap:6px;justify-content:flex-end}
</style></head><body>
<header><h1>${esc(L.title)}</h1><p>${esc(L.intro)}</p></header>
<main>
<label class="me">${esc(L.name)} <input id="me" autocomplete="name"></label>
<section><h2>${esc(L.comments)}</h2><div class="pins" id="pins"></div></section>
<section><h2>${esc(L.captures)}</h2><div class="shots" id="shots"></div></section>
</main>
<script>
const L = ${JSON.stringify(L).replace(/</g, '\\u003c')};
const base = location.pathname.replace(/\\/$/, '');
const me = document.getElementById('me');
try { me.value = localStorage.getItem('kinglet-name') || ''; } catch {}
me.addEventListener('change', () => { try { localStorage.setItem('kinglet-name', me.value); } catch {} });
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, author: me.value }) }).then(load);
let last = '';
async function load() {
  const d = await (await fetch(base + '/data', { cache: 'no-store' })).json();
  const sig = JSON.stringify(d);
  if (sig === last || document.activeElement?.tagName === 'TEXTAREA') return;
  last = sig;
  const list = document.getElementById('pins');
  list.replaceChildren(...(d.pins.length ? d.pins.map((p) => {
    const box = el('div', { className: 'pin' + (p.done ? ' done' : '') });
    if (p.hasImage) box.append(el('img', { src: base + '/pin/' + p.id + '.jpg', alt: '' }));
    const body = el('div', { style: 'flex:1;min-width:0' });
    body.append(el('div', {}, el('span', { className: 'n', textContent: p.n }), el('b', { textContent: p.author || L.you }), el('span', { className: 'meta', textContent: ' · ' + p.deviceLabel + (p.done ? ' · ' + L.done : '') })));
    body.append(el('div', { textContent: p.comment || '—', style: 'margin-top:4px;white-space:pre-wrap' }));
    for (const r of p.replies || []) body.append(el('div', { className: 'reply' }, el('b', { textContent: r.author || L.you }), el('div', { textContent: r.text, style: 'white-space:pre-wrap' })));
    const ta = el('textarea', { placeholder: L.reply });
    const btn = el('button', { textContent: L.send, onclick: () => ta.value.trim() && post('/reply', { pinId: p.id, text: ta.value }) });
    body.append(el('div', { style: 'display:grid;gap:6px;margin-top:10px' }, ta, el('div', { className: 'row' }, btn)));
    box.append(body);
    return box;
  }) : [el('p', { className: 'meta', textContent: L.none })]));
  const shots = document.getElementById('shots');
  shots.replaceChildren(...d.shots.map((s) => {
    const frame = el('div', { className: 'frame' });
    const img = el('img', { src: base + '/shot/' + s.id.replace(/[^\\w-]/g, '_') + '.jpg', alt: s.label, style: 'width:' + Math.min(s.width, 420) + 'px' });
    frame.append(img);
    for (const p of d.pins.filter((x) => x.deviceId === s.id && x.fx != null)) frame.append(el('span', { className: 'dot', textContent: p.n, style: 'left:' + p.fx * 100 + '%;top:' + p.fy * 100 + '%' }));
    img.addEventListener('click', (e) => {
      frame.querySelector('form')?.remove();
      const r = img.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const ta = el('textarea', { placeholder: L.what });
      const form = el('form', { className: 'new', style: 'left:' + Math.min(fx * r.width, r.width - 200) + 'px;top:' + fy * r.height + 'px', onsubmit: (ev) => { ev.preventDefault(); if (ta.value.trim()) { last = ''; form.remove(); post('/pin', { shotId: s.id, fx, fy, text: ta.value }); } } },
        ta, el('div', { className: 'row' }, el('button', { type: 'button', className: 'ghost', textContent: L.cancel, onclick: () => form.remove() }), el('button', { type: 'submit', textContent: L.send })));
      frame.append(el('span', { className: 'dot', textContent: '+', style: 'left:' + fx * 100 + '%;top:' + fy * 100 + '%' }), form);
      ta.focus();
    });
    return el('div', { className: 'shot' }, frame, el('span', { className: 'meta', textContent: s.label + ' · ' + s.width + '×' + s.height }));
  }));
}
load();
setInterval(load, 5000);
</script></body></html>`;
}
