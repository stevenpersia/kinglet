import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ArtifactEntry } from '../shared/types';
import type { HookPayload } from './claude';

/** What a publish of Claude Code's Artifact tool tells us, from its PostToolUse hook. */
export interface ArtifactPublish {
  /** Absolute path of the page Claude published (null for an artifact made from a type, without a local page). */
  file: string | null;
  /** The artifact's claude.ai link, when the tool's answer gave it. */
  url: string | null;
  /** A title Claude passed (types), else null. */
  title: string | null;
}

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/;
/** Calls of the Artifact tool that publish nothing. */
const NOT_PUBLISH = new Set(['read', 'list', 'delete', 'open', 'pin', 'unpin', 'quickstart']);
const MAX_PER_PROJECT = 40;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A publish of the Artifact tool, or null for any other tool call. */
export function artifactFromHook(p: HookPayload): ArtifactPublish | null {
  if (p.hook_event_name !== 'PostToolUse' || p.tool_name !== 'Artifact') return null;
  const i = (p.tool_input ?? {}) as Record<string, unknown>;
  if (NOT_PUBLISH.has(String(i.action ?? 'publish'))) return null;
  // An upload into an artifact's asset store isn't a new page.
  if (i.asset === true) return null;
  const raw = str(i.file_path);
  const file = raw ? (isAbsolute(raw) ? raw : p.cwd ? resolve(p.cwd, raw) : null) : null;
  let answer = '';
  try {
    answer = typeof p.tool_response === 'string' ? p.tool_response : JSON.stringify(p.tool_response ?? '');
  } catch {
    /* unreadable answer: the link stays unknown */
  }
  const url = answer.match(ARTIFACT_URL)?.[0] ?? str(i.url)?.match(ARTIFACT_URL)?.[0] ?? null;
  if (!file && !url) return null;
  // A data file of an artifact made from a type (a deck, a canvas…) isn't a page of its own.
  const page = file && /\.html?$/i.test(file) ? file : null;
  if (!page && !url) return null;
  return { file: page, url, title: str(i.title) };
}

/** The `<title>` of a page, decoded enough to show. */
export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const v = m?.[1]
    ?.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return v || null;
}

const nameOf = (a: ArtifactPublish) => {
  if (a.file) {
    try {
      const t = htmlTitle(readFileSync(a.file, 'utf8').slice(0, 64_000));
      if (t) return t;
    } catch {
      /* gone or unreadable: its name */
    }
    return basename(a.file).replace(/\.html?$/i, '');
  }
  return a.title ?? 'Artifact';
};

/** Add a publish to a project's list: a new version of the same artifact (same link or same page) or a new one, on top. */
export function upsertArtifact(list: ArtifactEntry[], a: ArtifactPublish, at: number, title: string, id = randomBytes(6).toString('hex')): ArtifactEntry[] {
  const i = list.findIndex((e) => (a.url && e.url === a.url) || (a.file && e.file === a.file));
  if (i < 0) return [{ id, title, file: a.file, url: a.url, version: 1, at, seen: false }, ...list].slice(0, MAX_PER_PROJECT);
  const prev = list[i]!;
  const next: ArtifactEntry = { ...prev, title, file: a.file ?? prev.file, url: a.url ?? prev.url, version: prev.version + 1, at, seen: false };
  return [next, ...list.slice(0, i), ...list.slice(i + 1)];
}

/** Artifacts Claude published, per project, kept in the user data folder. */
export class ArtifactStore {
  private file: string;
  value: Record<string, ArtifactEntry[]> = {};

  constructor(userData: string) {
    this.file = join(userData, 'artifacts.json');
    try {
      const v = JSON.parse(readFileSync(this.file, 'utf8'));
      if (v && typeof v === 'object' && !Array.isArray(v)) this.value = v;
    } catch {
      /* none yet */
    }
  }

  private save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.value));
    } catch {
      /* the list stays in memory */
    }
  }

  add(projectId: string, a: ArtifactPublish, at = Date.now()): ArtifactEntry {
    this.value[projectId] = upsertArtifact(this.value[projectId] ?? [], a, at, nameOf(a));
    this.save();
    return this.value[projectId]![0]!;
  }

  seen(projectId: string, id: string) {
    const list = this.value[projectId];
    const e = list?.find((x) => x.id === id);
    if (!e || e.seen) return false;
    this.value[projectId] = list!.map((x) => (x.id === id ? { ...x, seen: true } : x));
    this.save();
    return true;
  }

  remove(projectId: string, id: string) {
    this.value[projectId] = (this.value[projectId] ?? []).filter((x) => x.id !== id);
    this.save();
  }

  find(id: string): ArtifactEntry | null {
    for (const list of Object.values(this.value)) {
      const e = list.find((x) => x.id === id);
      if (e) return e;
    }
    return null;
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
};

/**
 * The file a request asks for, inside the artifact's folder only: no `..`, no hidden file or folder.
 * Null when it isn't allowed.
 */
export function servedPath(root: string, rest: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.'))) return null;
  const full = resolve(root, ...parts);
  const r = relative(root, full);
  if (r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('..')) return null;
  return full;
}

/**
 * Lets Kinglet point at an element of the artifact: the viewer asks (postMessage), a click answers with the
 * element. Does nothing until asked, and only for the page that embeds the artifact.
 */
export const PICKER_SCRIPT = `<script>(()=>{let on=false,box=null,hov=null;
const sel=(el)=>{const p=[];for(let e=el;e&&e.nodeType===1&&e!==document.body&&p.length<4;e=e.parentElement){let s=e.tagName.toLowerCase();if(e.id){p.unshift(s+'#'+e.id);break;}const c=[...e.classList].filter(x=>/^[A-Za-z_-][\\w-]*$/.test(x)).slice(0,2);if(c.length)s+='.'+c.join('.');p.unshift(s);}return p.join(' > ')||el.tagName.toLowerCase();};
const show=(el)=>{if(!box){box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #8ab4f8;outline-offset:2px;background:rgba(138,180,248,.12);border-radius:3px';document.documentElement.appendChild(box);}const r=el.getBoundingClientRect();Object.assign(box.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',display:'block'});};
const hide=()=>{if(box)box.style.display='none';};
addEventListener('mousemove',(e)=>{if(!on)return;hov=e.target;show(hov);},true);
addEventListener('click',(e)=>{if(!on)return;e.preventDefault();e.stopPropagation();const el=e.target;show(el);on=false;const txt=(el.innerText||el.getAttribute('aria-label')||el.getAttribute('alt')||'').replace(/\\s+/g,' ').trim().slice(0,120);parent.postMessage({kinglet:'picked',selector:sel(el),tag:el.tagName.toLowerCase(),text:txt},'*');},true);
addEventListener('message',(e)=>{if(e.source!==parent||!e.data||e.data.kinglet!=='pick')return;on=!!e.data.on;if(!on)hide();});
})();</script>`;

const inject = (html: string) => (/<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${PICKER_SCRIPT}</body>`) : html + PICKER_SCRIPT);

/**
 * Serves the artifacts' pages (and the files next to them) on 127.0.0.1, behind a random token: the viewer and
 * the devices open them like any site, scripts and relative files included.
 */
export class ArtifactServer {
  private server: Server | null = null;
  private token = randomBytes(16).toString('hex');
  port: number | null = null;

  constructor(private find: (id: string) => ArtifactEntry | null) {}

  async start(): Promise<number> {
    if (this.port) return this.port;
    const server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      const [, token, id, ...rest] = path.split('/');
      const entry = token === this.token && id ? this.find(id) : null;
      if (!entry?.file || req.method !== 'GET') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not found');
      }
      const root = dirname(entry.file);
      const target = rest.length && rest.join('/') ? servedPath(root, rest.join('/')) : entry.file;
      if (!target || !existsSync(target) || !statSync(target).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not found');
      }
      const type = TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';
      const headers = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (target === entry.file) {
        res.writeHead(200, headers);
        return res.end(inject(readFileSync(target, 'utf8')));
      }
      res.writeHead(200, headers);
      res.end(readFileSync(target));
    });
    await new Promise<void>((ok, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => ok());
    });
    this.server = server;
    const addr = server.address();
    this.port = typeof addr === 'object' && addr ? addr.port : null;
    return this.port!;
  }

  /** Where an artifact's page is served (null without a local page). */
  async urlOf(id: string): Promise<string | null> {
    const e = this.find(id);
    if (!e?.file) return null;
    const port = await this.start();
    return `http://127.0.0.1:${port}/${this.token}/${id}/${encodeURIComponent(basename(e.file))}`;
  }

  stop() {
    this.server?.close();
    this.server = null;
    this.port = null;
  }
}
