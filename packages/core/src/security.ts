import { parse } from 'node-html-parser';
import { t } from './i18n.ts';
import { detectFramework, type Framework } from './meta.ts';
import { fetchExplained } from './net.ts';

/**
 * Security of a page, as a visitor's browser receives it: secrets shipped in the JavaScript, files
 * left reachable on the server, security headers, cookies, mixed content and third-party scripts.
 * Everything is read from what the site already sends, except the sensitive-file probe (a handful of
 * GETs on well-known paths), which only runs when the caller says the site is the user's own.
 */

export type SecurityGroup = 'secrets' | 'files' | 'headers' | 'cookies' | 'transport' | 'thirdparty';
export type SecurityStatus = 'ok' | 'info' | 'warning' | 'error' | 'skip';

export interface SecurityCheck {
  id: string;
  group: SecurityGroup;
  label: string;
  status: SecurityStatus;
  detail: string;
}

export interface LeakedSecret {
  kind: string;
  /** Start and end of the value only: the report never carries a whole secret. */
  preview: string;
  /** Where it was found: a script URL, or "inline script". */
  where: string;
  severity: 'error' | 'warning';
}

export interface ExposedFile {
  path: string;
  url: string;
  what: string;
}

export interface CookieInfo {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  /** Looks like a session or auth cookie (name). */
  session: boolean;
}

export interface ThirdParty {
  host: string;
  scripts: number;
  /** Scripts from this host loaded without integrity="…" (only counted for static CDNs, where SRI applies). */
  withoutIntegrity: string[];
}

export interface SecurityReport {
  url: string;
  finalUrl: string;
  status: number;
  framework: Framework;
  /** Local dev server: headers and HTTPS are the dev server's, not production's. */
  local: boolean;
  /** Whether the sensitive-file probe ran. */
  probed: boolean;
  checks: SecurityCheck[];
  secrets: LeakedSecret[];
  sourceMaps: string[];
  exposedFiles: ExposedFile[];
  /** Security headers of the page response (lower-case name → value, null when absent). */
  headers: Record<string, string | null>;
  cookies: CookieInfo[];
  /** http:// resources on an https:// page (from the HTML and from the devices' console). */
  mixedContent: string[];
  /** Forms that post to http://, or ask for a password on a page served over http. */
  insecureForms: string[];
  thirdParty: ThirdParty[];
  scanned: { scripts: number; bytes: number };
  score: { passed: number; total: number };
}

export interface SecurityOptions {
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Probe well-known sensitive paths (/.env, /.git/config…). Only for the user's own site. */
  probe?: boolean;
  /** "Mixed Content" messages seen in the devices' console (rendered page). */
  consoleMessages?: string[];
  /** At most this many scripts are downloaded and scanned. */
  maxScripts?: number;
}

export const SECURITY_GROUPS: { id: SecurityGroup; label: () => string }[] = [
  { id: 'secrets', label: () => t('Secrets in the code', 'Secrets dans le code') },
  { id: 'files', label: () => t('Exposed files', 'Fichiers exposés') },
  { id: 'headers', label: () => t('Security headers', 'En-têtes de sécurité') },
  { id: 'cookies', label: () => 'Cookies' },
  { id: 'transport', label: () => t('HTTPS and mixed content', 'HTTPS et contenu mixte') },
  { id: 'thirdparty', label: () => t('Third-party scripts', 'Scripts tiers') },
];

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const MAX_SCRIPT_BYTES = 4 * 1024 * 1024;

export const isLocalHost = (host: string) => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i.test(host.replace(/:\d+$/, ''));

/* ------------------------------------------------------------------ */
/* 1. Secrets                                                          */
/* ------------------------------------------------------------------ */

interface SecretRule {
  kind: string;
  re: RegExp;
  severity: 'error' | 'warning';
}

/** Keys that must never reach a browser. Publishable keys (Stripe pk_, Supabase anon, Firebase AIza…) are fine and not listed. */
export const SECRET_RULES: SecretRule[] = [
  { kind: 'Stripe secret key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/g, severity: 'error' },
  { kind: 'Stripe test secret key', re: /\b(?:sk|rk)_test_[0-9a-zA-Z]{20,}/g, severity: 'warning' },
  { kind: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{60,}/g, severity: 'error' },
  { kind: 'OpenAI API key', re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g, severity: 'error' },
  { kind: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'error' },
  { kind: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{70,}/g, severity: 'error' },
  { kind: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, severity: 'error' },
  { kind: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, severity: 'error' },
  { kind: 'Resend API key', re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}/g, severity: 'error' },
  { kind: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, severity: 'error' },
];

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export const redact = (s: string) => (s.length <= 12 ? `${s.slice(0, 3)}…` : `${s.slice(0, 8)}…${s.slice(-4)}`);

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Secrets in one piece of JavaScript (or HTML). */
export function findSecrets(code: string, where: string): LeakedSecret[] {
  const found = new Map<string, LeakedSecret>();
  for (const rule of SECRET_RULES) {
    for (const m of code.matchAll(rule.re)) {
      const v = m[0];
      if (rule.kind === 'Private key') found.set(v + where, { kind: rule.kind, preview: v, where, severity: rule.severity });
      else found.set(v, { kind: rule.kind, preview: redact(v), where, severity: rule.severity });
    }
  }
  // Supabase: the anon key is public by design, the service_role key bypasses every row-level rule.
  for (const m of code.matchAll(JWT)) {
    const payload = jwtPayload(m[0]);
    if (payload?.['role'] === 'service_role') found.set(m[0], { kind: 'Supabase service_role key', preview: redact(m[0]), where, severity: 'error' });
  }
  return [...found.values()];
}

/* ------------------------------------------------------------------ */
/* 2. Sensitive files                                                  */
/* ------------------------------------------------------------------ */

interface Probe {
  path: string;
  what: () => string;
  /** The body really is that file (not the SPA's index.html served for every path). */
  is: (body: string) => boolean;
}

const notHtml = (b: string) => !/^\s*<(!doctype|html|head|body)/i.test(b);
export const PROBES: Probe[] = [
  { path: '/.env', what: () => t('environment variables (often API keys)', 'variables d’environnement (souvent des clés d’API)'), is: (b) => notHtml(b) && /^[A-Z_][A-Z0-9_]*\s*=/m.test(b) },
  { path: '/.env.local', what: () => t('local environment variables', 'variables d’environnement locales'), is: (b) => notHtml(b) && /^[A-Z_][A-Z0-9_]*\s*=/m.test(b) },
  { path: '/.env.production', what: () => t('production environment variables', 'variables d’environnement de production'), is: (b) => notHtml(b) && /^[A-Z_][A-Z0-9_]*\s*=/m.test(b) },
  { path: '/.git/config', what: () => t('git configuration (the whole history can be downloaded)', 'configuration git (tout l’historique peut être téléchargé)'), is: (b) => /\[core\]/.test(b) && notHtml(b) },
  { path: '/.git/HEAD', what: () => t('git repository', 'dépôt git'), is: (b) => /^ref: refs\//.test(b.trim()) },
  { path: '/.npmrc', what: () => t('npm configuration (may hold a registry token)', 'configuration npm (peut contenir un jeton)'), is: (b) => notHtml(b) && /(_authToken|registry\s*=)/.test(b) },
  { path: '/.DS_Store', what: () => t('macOS folder listing (file names)', 'liste de dossier macOS (noms de fichiers)'), is: (b) => b.includes('Bud1') },
  { path: '/backup.sql', what: () => t('database dump', 'sauvegarde de base de données'), is: (b) => notHtml(b) && /(CREATE TABLE|INSERT INTO)/i.test(b) },
  { path: '/dump.sql', what: () => t('database dump', 'sauvegarde de base de données'), is: (b) => notHtml(b) && /(CREATE TABLE|INSERT INTO)/i.test(b) },
];

/* ------------------------------------------------------------------ */
/* 3. Headers                                                          */
/* ------------------------------------------------------------------ */

export const SECURITY_HEADERS = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'] as const;

/** The headers Kinglet recommends, as a starting point (a CSP is site-specific: report-only first). */
export const RECOMMENDED_HEADERS: [string, string][] = [
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy-Report-Only', "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"],
];

/** Where to paste the headers, for the framework detected (any site deployed on Vercel can use vercel.json). */
export function headersFix(framework: Framework, missing: string[]): { file: string; code: string }[] {
  const wanted = RECOMMENDED_HEADERS.filter(([name]) => missing.some((m) => name.toLowerCase().startsWith(m) || (m === 'content-security-policy' && name.startsWith('Content-Security-Policy'))));
  const list = wanted.length ? wanted : RECOMMENDED_HEADERS;
  const out: { file: string; code: string }[] = [];
  if (framework === 'next')
    out.push({
      file: 'next.config.js',
      code: `module.exports = {\n  async headers() {\n    return [{\n      source: '/(.*)',\n      headers: [\n${list.map(([k, v]) => `        { key: '${k}', value: "${v}" },`).join('\n')}\n      ],\n    }];\n  },\n};`,
    });
  if (framework === 'nuxt')
    out.push({ file: 'nuxt.config.ts', code: `export default defineNuxtConfig({\n  routeRules: {\n    '/**': {\n      headers: {\n${list.map(([k, v]) => `        '${k}': "${v}",`).join('\n')}\n      },\n    },\n  },\n});` });
  if (framework === 'sveltekit')
    out.push({ file: 'src/hooks.server.ts', code: `export async function handle({ event, resolve }) {\n  const response = await resolve(event);\n${list.map(([k, v]) => `  response.headers.set('${k}', "${v}");`).join('\n')}\n  return response;\n}` });
  out.push({ file: 'vercel.json', code: JSON.stringify({ headers: [{ source: '/(.*)', headers: list.map(([key, value]) => ({ key, value })) }] }, null, 2) });
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. Cookies                                                          */
/* ------------------------------------------------------------------ */

const SESSION_NAME = /(sess|sid|auth|token|jwt|login|user|account|connect\.sid|supabase|next-auth|__Secure-|__Host-)/i;

export function parseSetCookie(line: string): CookieInfo {
  const [pair, ...attrs] = line.split(';').map((s) => s.trim());
  const name = (pair ?? '').split('=')[0]!.trim();
  const has = (a: string) => attrs.some((x) => x.toLowerCase() === a || x.toLowerCase().startsWith(`${a}=`));
  const same = attrs.find((x) => x.toLowerCase().startsWith('samesite='));
  return { name, secure: has('secure'), httpOnly: has('httponly'), sameSite: same ? same.split('=')[1]!.trim() : null, session: SESSION_NAME.test(name) };
}

/* ------------------------------------------------------------------ */
/* 6. Third parties                                                    */
/* ------------------------------------------------------------------ */

/** Static CDNs serving fixed files: there, integrity="…" (SRI) protects against a compromised CDN. */
const STATIC_CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|cdn\.skypack\.dev|esm\.sh|ajax\.googleapis\.com)$/i;

/* ------------------------------------------------------------------ */
/* The audit                                                           */
/* ------------------------------------------------------------------ */

async function getText(f: typeof fetch, url: string, init: RequestInit, limit = MAX_SCRIPT_BYTES): Promise<{ status: number; text: string; bytes: number } | null> {
  try {
    const res = await f(url, init);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, text: new TextDecoder().decode(buf.subarray(0, limit)), bytes: buf.length };
  } catch {
    return null;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

export async function auditSecurity(url: string, opts: SecurityOptions = {}): Promise<SecurityReport> {
  const f = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 12000;
  const baseHeaders = { 'user-agent': BROWSER_UA, ...opts.headers };
  const init = (extra: RequestInit = {}): RequestInit => ({ redirect: 'follow', headers: { ...baseHeaders, accept: '*/*' }, signal: AbortSignal.timeout(timeout), ...extra });

  const res = await fetchExplained(f, url, { ...init(), headers: { ...baseHeaders, accept: 'text/html,*/*;q=0.8' } });
  const html = await res.text();
  const finalUrl = res.url || url;
  const page = new URL(finalUrl);
  const local = isLocalHost(page.host);
  const https = page.protocol === 'https:';
  const framework = detectFramework(html);
  const root = parse(html, { lowerCaseTagName: true });
  const abs = (u: string | undefined) => {
    if (!u) return null;
    try {
      return new URL(u, finalUrl).href;
    } catch {
      return null;
    }
  };

  const checks: SecurityCheck[] = [];
  const add = (id: string, group: SecurityGroup, label: string, status: SecurityStatus, detail: string) => checks.push({ id, group, label, status, detail });

  // Scripts: external (downloaded, scanned) and inline.
  const scriptTags = root.querySelectorAll('script');
  const external = scriptTags.map((s) => ({ src: abs(s.getAttribute('src')), integrity: s.getAttribute('integrity') })).filter((s): s is { src: string; integrity: string | undefined } => !!s.src);
  const modulePreloads = root
    .querySelectorAll('link')
    .filter((l) => /modulepreload|preload/i.test(l.getAttribute('rel') ?? '') && (l.getAttribute('as') === 'script' || /modulepreload/i.test(l.getAttribute('rel') ?? '')))
    .map((l) => abs(l.getAttribute('href')))
    .filter((u): u is string => !!u);
  const toScan = [...new Set([...external.map((s) => s.src), ...modulePreloads])].filter((u) => /^https?:/.test(u)).slice(0, opts.maxScripts ?? 40);

  const secrets: LeakedSecret[] = [];
  const pushSecrets = (list: LeakedSecret[]) => {
    for (const s of list) if (!secrets.some((x) => x.kind === s.kind && x.preview === s.preview)) secrets.push(s);
  };
  scriptTags.filter((s) => !s.getAttribute('src')).forEach((s) => pushSecrets(findSecrets(s.textContent, t('inline script', 'script en ligne'))));
  pushSecrets(findSecrets(html.replace(/<script[\s\S]*?<\/script>/gi, ''), 'HTML'));

  let bytes = 0;
  const mapCandidates: string[] = [];
  await pool(toScan, 6, async (src) => {
    const r = await getText(f, src, init());
    if (!r || r.status >= 400) return;
    bytes += r.bytes;
    pushSecrets(findSecrets(r.text, src));
    const map = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(r.text.slice(-2000))?.[1];
    if (map && !map.startsWith('data:')) mapCandidates.push(new URL(map, src).href);
  });

  // Source maps: the whole original source, comments included. Worth knowing outside localhost.
  const sourceMaps: string[] = [];
  if (!local) {
    const maps = [...new Set(mapCandidates)].slice(0, 10);
    await pool(maps, 4, async (m) => {
      const r = await getText(f, m, init(), 2048);
      if (r && r.status === 200 && /"(version|sources|mappings)"/.test(r.text)) sourceMaps.push(m);
    });
  }

  const errs = secrets.filter((s) => s.severity === 'error');
  add(
    'secrets',
    'secrets',
    t('API keys and tokens', 'Clés d’API et jetons'),
    errs.length ? 'error' : secrets.length ? 'warning' : 'ok',
    secrets.length
      ? t(
          `${secrets.length} secret${secrets.length > 1 ? 's' : ''} sent to every visitor: ${secrets.map((s) => s.kind).join(', ')}. Revoke ${secrets.length > 1 ? 'them' : 'it'} now, then move the call to the server.`,
          `${secrets.length} secret${secrets.length > 1 ? 's' : ''} envoyé${secrets.length > 1 ? 's' : ''} à chaque visiteur : ${secrets.map((s) => s.kind).join(', ')}. Révoque-${secrets.length > 1 ? 'les' : 'le'} tout de suite, puis passe l’appel côté serveur.`,
        )
      : t(`No secret key in the HTML and ${toScan.length} script${toScan.length > 1 ? 's' : ''} (${Math.max(1, Math.round(bytes / 1024))} KB).`, `Aucune clé secrète dans le HTML et ${toScan.length} script${toScan.length > 1 ? 's' : ''} (${Math.max(1, Math.round(bytes / 1024))} Ko).`),
  );
  add(
    'source-maps',
    'secrets',
    t('Public source maps', 'Source maps publiques'),
    local ? 'skip' : sourceMaps.length ? 'warning' : 'ok',
    local
      ? t('Normal on a dev server: checked on previews and production.', 'Normal sur un serveur de dev : vérifié sur les previews et la prod.')
      : sourceMaps.length
        ? t(`${sourceMaps.length} .map file${sourceMaps.length > 1 ? 's' : ''} reachable: anyone can read your original source, comments included.`, `${sourceMaps.length} fichier${sourceMaps.length > 1 ? 's' : ''} .map accessible${sourceMaps.length > 1 ? 's' : ''} : n’importe qui peut lire ton code source, commentaires compris.`)
        : t('No source map reachable.', 'Aucune source map accessible.'),
  );

  // 2. Sensitive files.
  const exposedFiles: ExposedFile[] = [];
  if (opts.probe) {
    await pool(PROBES, 4, async (p) => {
      const target = new URL(p.path, page.origin).href;
      const r = await getText(f, target, init({ redirect: 'manual' }), 64 * 1024);
      if (r && r.status === 200 && p.is(r.text)) exposedFiles.push({ path: p.path, url: target, what: p.what() });
    });
    exposedFiles.sort((a, b) => PROBES.findIndex((p) => p.path === a.path) - PROBES.findIndex((p) => p.path === b.path));
  }
  add(
    'exposed-files',
    'files',
    t('Sensitive files', 'Fichiers sensibles'),
    !opts.probe ? 'skip' : exposedFiles.length ? 'error' : 'ok',
    !opts.probe
      ? t('Not checked: Kinglet only tries these paths on your own site.', 'Non vérifié : Kinglet n’essaie ces chemins que sur ton propre site.')
      : exposedFiles.length
        ? t(`Reachable by anyone: ${exposedFiles.map((e) => `${e.path} (${e.what})`).join(', ')}.`, `Accessibles à tous : ${exposedFiles.map((e) => `${e.path} (${e.what})`).join(', ')}.`)
        : t(`None of ${PROBES.length} well-known paths (.env, .git, .npmrc, dumps…) answers.`, `Aucun des ${PROBES.length} chemins connus (.env, .git, .npmrc, sauvegardes…) ne répond.`),
  );

  // 3. Headers.
  const headers: Record<string, string | null> = {};
  for (const h of SECURITY_HEADERS) headers[h] = res.headers.get(h);
  const csp = headers['content-security-policy'];
  const frameOk = !!headers['x-frame-options'] || /frame-ancestors/i.test(csp ?? '');
  const hdr = (id: string, label: string, present: boolean, missingLevel: SecurityStatus, okText: string, missingText: string) =>
    add(id, 'headers', label, local ? 'skip' : present ? 'ok' : missingLevel, local ? t('Set by the dev server here: checked on previews and production.', 'Fixé par le serveur de dev ici : vérifié sur les previews et la prod.') : present ? okText : missingText);
  hdr('hsts', 'Strict-Transport-Security', !!headers['strict-transport-security'] || !https, 'warning', headers['strict-transport-security'] ?? t('Served over http.', 'Servi en http.'), t('Missing: a first visit over http can be intercepted before the redirect to https.', 'Absent : une première visite en http peut être interceptée avant la redirection vers https.'));
  hdr(
    'csp',
    'Content-Security-Policy',
    !!csp,
    'warning',
    /'unsafe-inline'/.test(/script-src[^;]*/.exec(csp ?? '')?.[0] ?? csp ?? '') ? t(`Present, but script-src allows 'unsafe-inline' (weak against injected scripts).`, `Présent, mais script-src autorise 'unsafe-inline' (faible contre les scripts injectés).`) : t('Present.', 'Présent.'),
    t('Missing: nothing limits where scripts can come from if someone injects one.', 'Absent : rien ne limite l’origine des scripts si quelqu’un en injecte un.'),
  );
  hdr('nosniff', 'X-Content-Type-Options', headers['x-content-type-options']?.toLowerCase() === 'nosniff', 'warning', 'nosniff', t('Missing: browsers may guess file types (nosniff).', 'Absent : les navigateurs peuvent deviner le type des fichiers (nosniff).'));
  hdr('framing', t('Framing protection', 'Protection contre l’intégration'), frameOk, 'warning', headers['x-frame-options'] ?? 'frame-ancestors', t('Missing: another site can show yours in a frame and trick clicks (clickjacking).', 'Absent : un autre site peut afficher le tien dans un cadre et piéger les clics (clickjacking).'));
  hdr('referrer', 'Referrer-Policy', !!headers['referrer-policy'], 'info', headers['referrer-policy'] ?? '', t('Missing: browsers use their default (usually fine, set it to be sure).', 'Absent : les navigateurs appliquent leur défaut (souvent correct, à fixer pour être sûr).'));
  hdr('permissions', 'Permissions-Policy', !!headers['permissions-policy'], 'info', headers['permissions-policy'] ?? '', t('Missing: optional, limits camera, microphone and location to what you use.', 'Absent : facultatif, limite caméra, micro et position à ce que tu utilises.'));
  const powered = res.headers.get('x-powered-by');
  const server = res.headers.get('server');
  const versioned = [powered, server].filter((v): v is string => !!v && /\d/.test(v));
  add('disclosure', 'headers', t('Version disclosure', 'Versions affichées'), local ? 'skip' : versioned.length ? 'info' : 'ok', local ? t('Dev server.', 'Serveur de dev.') : versioned.length ? t(`The server announces ${versioned.join(', ')}: easier to target known flaws.`, `Le serveur annonce ${versioned.join(', ')} : plus facile de viser des failles connues.`) : t('No version announced.', 'Aucune version annoncée.'));

  // 4. Cookies.
  const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
  const cookies = setCookies.map(parseSetCookie).filter((c) => c.name);
  const sessionNoHttpOnly = cookies.filter((c) => c.session && !c.httpOnly);
  const noSecure = https ? cookies.filter((c) => !c.secure) : [];
  const noSameSite = cookies.filter((c) => !c.sameSite);
  add(
    'cookies',
    'cookies',
    t('Cookie flags', 'Attributs des cookies'),
    !cookies.length ? 'skip' : sessionNoHttpOnly.length ? 'error' : noSecure.length || noSameSite.length ? 'warning' : 'ok',
    !cookies.length
      ? t('The page sets no cookie (cookies set by JavaScript aren’t seen here).', 'La page ne pose aucun cookie (ceux posés par JavaScript ne sont pas vus ici).')
      : [
          sessionNoHttpOnly.length ? t(`Session cookie readable by JavaScript (no HttpOnly): ${sessionNoHttpOnly.map((c) => c.name).join(', ')}.`, `Cookie de session lisible par JavaScript (sans HttpOnly) : ${sessionNoHttpOnly.map((c) => c.name).join(', ')}.`) : '',
          noSecure.length ? t(`Without Secure: ${noSecure.map((c) => c.name).join(', ')}.`, `Sans Secure : ${noSecure.map((c) => c.name).join(', ')}.`) : '',
          noSameSite.length ? t(`Without SameSite: ${noSameSite.map((c) => c.name).join(', ')}.`, `Sans SameSite : ${noSameSite.map((c) => c.name).join(', ')}.`) : '',
        ]
          .filter(Boolean)
          .join(' ') || t(`${cookies.length} cookie${cookies.length > 1 ? 's' : ''}, all with Secure, HttpOnly where needed and SameSite.`, `${cookies.length} cookie${cookies.length > 1 ? 's' : ''}, tous avec Secure, HttpOnly si besoin et SameSite.`),
  );

  // 5. Transport: https, mixed content, forms.
  if (!local) {
    let redirects: boolean | null = null;
    if (https) {
      const http = new URL(finalUrl);
      http.protocol = 'http:';
      try {
        const r = await f(http.href, { ...init({ redirect: 'manual' }) });
        const loc = r.headers.get('location') ?? '';
        redirects = r.status >= 300 && r.status < 400 && loc.startsWith('https://');
      } catch {
        redirects = null;
      }
    }
    add(
      'https',
      'transport',
      'HTTPS',
      !https ? 'error' : redirects === false ? 'warning' : 'ok',
      !https ? t('Served over http: everything can be read and changed on the way.', 'Servi en http : tout peut être lu et modifié en chemin.') : redirects === false ? t('http:// doesn’t redirect to https://.', 'http:// ne redirige pas vers https://.') : t('https, and http:// redirects to it.', 'https, et http:// y redirige.'),
    );
  } else add('https', 'transport', 'HTTPS', 'skip', t('Local dev server: checked on previews and production.', 'Serveur de dev local : vérifié sur les previews et la prod.'));

  const mixed = new Set<string>();
  if (https) {
    const resourceAttrs: [string, string][] = [
      ['script', 'src'],
      ['img', 'src'],
      ['iframe', 'src'],
      ['audio', 'src'],
      ['video', 'src'],
      ['source', 'src'],
      ['embed', 'src'],
    ];
    for (const [tag, attr] of resourceAttrs) for (const el of root.querySelectorAll(tag)) if (el.getAttribute(attr)?.startsWith('http://')) mixed.add(el.getAttribute(attr)!);
    for (const l of root.querySelectorAll('link')) if (/stylesheet|icon|preload|modulepreload/i.test(l.getAttribute('rel') ?? '') && l.getAttribute('href')?.startsWith('http://')) mixed.add(l.getAttribute('href')!);
  }
  for (const m of opts.consoleMessages ?? []) {
    const u = /Mixed Content:.*?'(http:\/\/[^']+)'/i.exec(m)?.[1];
    if (u) mixed.add(u);
  }
  const mixedContent = [...mixed];
  add(
    'mixed',
    'transport',
    t('Mixed content', 'Contenu mixte'),
    !https ? 'skip' : mixedContent.length ? 'warning' : 'ok',
    !https ? t('Page served over http.', 'Page servie en http.') : mixedContent.length ? t(`${mixedContent.length} resource${mixedContent.length > 1 ? 's' : ''} over http:// on an https page (blocked or flagged by browsers).`, `${mixedContent.length} ressource${mixedContent.length > 1 ? 's' : ''} en http:// sur une page https (bloquées ou signalées par les navigateurs).`) : t('Everything loads over https.', 'Tout se charge en https.'),
  );

  const insecureForms: string[] = [];
  for (const form of root.querySelectorAll('form')) {
    const action = abs(form.getAttribute('action') ?? '') ?? finalUrl;
    const password = !!form.querySelector('input[type=password]');
    const label = form.getAttribute('id') ? `#${form.getAttribute('id')}` : form.getAttribute('name') ? `form[name=${form.getAttribute('name')}]` : action;
    if (action.startsWith('http://') && !isLocalHost(new URL(action).host)) insecureForms.push(t(`${label} posts to ${action}`, `${label} envoie vers ${action}`));
    else if (password && !https && !local) insecureForms.push(t(`${label} asks for a password over http`, `${label} demande un mot de passe en http`));
  }
  add(
    'forms',
    'transport',
    t('Forms', 'Formulaires'),
    !root.querySelectorAll('form').length ? 'skip' : insecureForms.length ? 'error' : 'ok',
    !root.querySelectorAll('form').length ? t('No form in the HTML.', 'Aucun formulaire dans le HTML.') : insecureForms.length ? `${insecureForms.join(' · ')}.` : t('Every form sends over https.', 'Chaque formulaire envoie en https.'),
  );

  // 6. Third parties.
  const byHost = new Map<string, ThirdParty>();
  for (const s of external) {
    const host = new URL(s.src).host;
    if (host === page.host) continue;
    const tp = byHost.get(host) ?? { host, scripts: 0, withoutIntegrity: [] };
    tp.scripts++;
    if (!s.integrity && STATIC_CDN.test(host)) tp.withoutIntegrity.push(s.src);
    byHost.set(host, tp);
  }
  const thirdParty = [...byHost.values()].sort((a, b) => b.scripts - a.scripts);
  const noSri = thirdParty.flatMap((tp) => tp.withoutIntegrity);
  add(
    'sri',
    'thirdparty',
    t('Integrity of CDN scripts', 'Intégrité des scripts de CDN'),
    noSri.length ? 'warning' : 'ok',
    noSri.length
      ? t(`${noSri.length} script${noSri.length > 1 ? 's' : ''} from a public CDN without integrity="…": if the CDN is compromised, so is your site.`, `${noSri.length} script${noSri.length > 1 ? 's' : ''} d’un CDN public sans integrity="…" : si le CDN est compromis, ton site l’est aussi.`)
      : t('Scripts from public CDNs are pinned with integrity, or there are none.', 'Les scripts de CDN publics sont verrouillés par integrity, ou il n’y en a pas.'),
  );
  add(
    'third-party',
    'thirdparty',
    t('Third-party domains', 'Domaines tiers'),
    thirdParty.length ? 'info' : 'ok',
    thirdParty.length
      ? t(`Scripts from ${thirdParty.length} domain${thirdParty.length > 1 ? 's' : ''} run with full access to the page: ${thirdParty.map((tp) => tp.host).join(', ')}.`, `Des scripts de ${thirdParty.length} domaine${thirdParty.length > 1 ? 's' : ''} tournent avec un accès complet à la page : ${thirdParty.map((tp) => tp.host).join(', ')}.`)
      : t('Every script comes from your own domain.', 'Tous les scripts viennent de ton propre domaine.'),
  );

  const counted = checks.filter((c) => c.status !== 'skip' && c.status !== 'info');
  return {
    url,
    finalUrl,
    status: res.status,
    framework,
    local,
    probed: !!opts.probe,
    checks,
    secrets,
    sourceMaps,
    exposedFiles,
    headers,
    cookies,
    mixedContent,
    insecureForms,
    thirdParty,
    scanned: { scripts: toScan.length, bytes },
    score: { passed: counted.filter((c) => c.status === 'ok').length, total: counted.length },
  };
}

/** What to tell Claude to fix, problem by problem (for "Ask Claude" and the MCP prompt). */
export function securityPrompt(r: SecurityReport): string {
  const lines: string[] = [];
  const problems = r.checks.filter((c) => c.status === 'error' || c.status === 'warning');
  lines.push(t(`Security problems found by Kinglet on ${r.finalUrl} (${r.framework}):`, `Problèmes de sécurité trouvés par Kinglet sur ${r.finalUrl} (${r.framework}) :`));
  for (const c of problems) lines.push(`- [${c.status}] ${c.label}: ${c.detail}`);
  if (r.secrets.length) {
    lines.push('', t('Secrets (values shortened):', 'Secrets (valeurs raccourcies) :'));
    for (const s of r.secrets) lines.push(`- ${s.kind} ${s.preview} in ${s.where}`);
    lines.push(
      t(
        'Find where each one is read (process.env, import.meta.env, a hard-coded string), move that code to a server route or function, and keep only publishable keys on the client. Tell me which keys to revoke and where: a key that reached a browser must be rotated even once removed.',
        'Trouve où chacun est lu (process.env, import.meta.env, une chaîne en dur), déplace ce code dans une route ou fonction serveur, et ne garde côté client que des clés publiques. Dis-moi quelles clés révoquer et où : une clé arrivée dans un navigateur doit être changée même une fois retirée.',
      ),
    );
  }
  if (r.exposedFiles.length) lines.push('', t(`Exposed files: ${r.exposedFiles.map((e) => e.url).join(', ')}. Make sure they aren’t deployed (public folder, build output, server config) and add rules that refuse them.`, `Fichiers exposés : ${r.exposedFiles.map((e) => e.url).join(', ')}. Fais en sorte qu’ils ne soient pas déployés (dossier public, sortie du build, config du serveur) et ajoute des règles qui les refusent.`));
  const missing = SECURITY_HEADERS.filter((h) => !r.headers[h]);
  if (!r.local && missing.length) {
    lines.push('', t('Missing headers. A starting point:', 'En-têtes manquants. Point de départ :'));
    for (const fix of headersFix(r.framework, missing)) lines.push(`${fix.file}:`, '```', fix.code, '```');
    lines.push(t('Start the Content-Security-Policy in Report-Only, check nothing legitimate is blocked, then enforce it.', 'Commence la Content-Security-Policy en Report-Only, vérifie que rien de légitime n’est bloqué, puis applique-la.'));
  }
  if (r.sourceMaps.length) lines.push('', t('Turn off public source maps in production (e.g. productionBrowserSourceMaps: false in Next.js, build.sourcemap: false in Vite) or upload them to your error tracker only.', 'Désactive les source maps publiques en production (par ex. productionBrowserSourceMaps: false dans Next.js, build.sourcemap: false dans Vite) ou envoie-les seulement à ton outil de suivi d’erreurs.'));
  if (r.mixedContent.length) lines.push('', t(`Load these over https: ${r.mixedContent.join(', ')}.`, `Charge-les en https : ${r.mixedContent.join(', ')}.`));
  if (r.insecureForms.length) lines.push('', t(`Forms: ${r.insecureForms.join('; ')}. Send them over https.`, `Formulaires : ${r.insecureForms.join(' ; ')}. Envoie-les en https.`));
  const noSri = r.thirdParty.flatMap((tp) => tp.withoutIntegrity);
  if (noSri.length) lines.push('', t(`Add integrity="sha384-…" and crossorigin="anonymous" to: ${noSri.join(', ')} (or self-host them).`, `Ajoute integrity="sha384-…" et crossorigin="anonymous" à : ${noSri.join(', ')} (ou héberge-les toi-même).`));
  if (r.cookies.some((c) => (c.session && !c.httpOnly) || !c.sameSite || (!c.secure && r.finalUrl.startsWith('https:')))) lines.push('', t('Set cookies with Secure, SameSite=Lax (or Strict), and HttpOnly for session cookies.', 'Pose les cookies avec Secure, SameSite=Lax (ou Strict), et HttpOnly pour les cookies de session.'));
  lines.push('', t('Then run Kinglet’s run_security again to check.', 'Puis relance run_security de Kinglet pour vérifier.'));
  return lines.join('\n');
}

/** For Compare and the history: the headers present, the score and the problems, in a few words. */
export function securitySummary(r: SecurityReport): { passed: number; total: number; headers: string[]; problems: string[] } {
  return {
    passed: r.score.passed,
    total: r.score.total,
    headers: SECURITY_HEADERS.filter((h) => r.headers[h]),
    problems: r.checks.filter((c) => c.status === 'error' || c.status === 'warning').map((c) => c.label),
  };
}
