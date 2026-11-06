import { describe, expect, it } from 'vitest';
import { auditSecurity, findSecrets, headersFix, parseSetCookie, securityPrompt, securitySummary } from './security.ts';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (payload: unknown) => `eyJhbGciOiJIUzI1NiJ9.${b64(payload)}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
const STRIPE = 'sk_live_' + 'a'.repeat(24);
const SERVICE = jwt({ iss: 'supabase', role: 'service_role' });
const ANON = jwt({ iss: 'supabase', role: 'anon' });

type Route = { status?: number; body?: string; headers?: Record<string, string>; cookies?: string[] };

/** A fake site: path → response; anything else is the SPA's index.html (as many hosts do). */
function site(origin: string, routes: Record<string, Route>, fallback = '<!doctype html><html><body>app</body></html>') {
  const seen: string[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    seen.push(u.href);
    if (u.protocol === 'http:' && origin.startsWith('https:') && (init?.redirect === 'manual' || u.pathname === '/'))
      return new Response(null, { status: 308, headers: { location: `https://${u.host}${u.pathname}` } });
    const r = routes[u.pathname] ?? { body: fallback, headers: { 'content-type': 'text/html' } };
    const h = new Headers(r.headers);
    for (const c of r.cookies ?? []) h.append('set-cookie', c);
    const res = new Response(r.body ?? '', { status: r.status ?? 200, headers: h });
    Object.defineProperty(res, 'url', { value: u.href });
    return res;
  }) as typeof fetch;
  return { f, seen };
}

describe('findSecrets', () => {
  it('finds secret keys, never publishable ones, and shortens them', () => {
    const code = `const a="${STRIPE}";const pk="pk_live_${'b'.repeat(24)}";const s="${SERVICE}";const anon="${ANON}";const f="AIzaSyD${'c'.repeat(32)}";`;
    const found = findSecrets(code, 'app.js');
    expect(found.map((s) => s.kind).sort()).toEqual(['Stripe secret key', 'Supabase service_role key']);
    expect(found.every((s) => !s.preview.includes('a'.repeat(20)))).toBe(true);
    expect(findSecrets(`k="sk_test_${'d'.repeat(24)}"`, 'x')[0]).toMatchObject({ kind: 'Stripe test secret key', severity: 'warning' });
    expect(findSecrets('-----BEGIN PRIVATE KEY-----\nabc', 'x')[0]?.kind).toBe('Private key');
    expect(findSecrets(`ghp_${'A'.repeat(36)} AKIA${'B'.repeat(16)}`, 'x').map((s) => s.kind)).toEqual(['AWS access key', 'GitHub token']);
  });
});

describe('parseSetCookie', () => {
  it('reads the flags', () => {
    expect(parseSetCookie('session=abc; Path=/; HttpOnly; Secure; SameSite=Lax')).toEqual({ name: 'session', secure: true, httpOnly: true, sameSite: 'Lax', session: true });
    expect(parseSetCookie('theme=dark; Path=/')).toMatchObject({ name: 'theme', secure: false, httpOnly: false, sameSite: null, session: false });
  });
});

describe('auditSecurity', () => {
  const html = `<!doctype html><html><head>
    <script src="/assets/app.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/lib@1/lib.min.js"></script>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
    <link rel="stylesheet" href="http://insecure.example/style.css">
  </head><body><img src="http://insecure.example/a.png"><form action="http://forms.example/send"><input name="email"></form>
  <script>window.cfg={k:"${'sk-ant-api03-' + 'x'.repeat(90)}"}</script></body></html>`;
  const routes: Record<string, Route> = {
    '/': { body: html, headers: { 'content-type': 'text/html', 'x-powered-by': 'Express 4.18.2' }, cookies: ['sid=1; Path=/', 'theme=dark; Path=/; Secure; SameSite=Lax'] },
    '/assets/app.js': { body: `fetch("/api",{headers:{Authorization:"Bearer ${STRIPE}"}});\n//# sourceMappingURL=app.js.map`, headers: { 'content-type': 'text/javascript' } },
    '/assets/app.js.map': { body: '{"version":3,"sources":["src/app.ts"],"mappings":"AAAA"}' },
    '/.env': { body: 'OPENAI_API_KEY=sk-123\nDATABASE_URL=postgres://x' },
    '/.git/HEAD': { body: 'ref: refs/heads/main\n' },
  };

  it('finds what a visitor can get, and only probes when asked', async () => {
    const { f, seen } = site('https://shop.example', routes);
    const r = await auditSecurity('https://shop.example/', { fetchImpl: f, probe: true, consoleMessages: ["Mixed Content: The page at 'https://shop.example/' was loaded over HTTPS, but requested an insecure resource 'http://api.example/x'. This request has been blocked"] });
    const status = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(r.local).toBe(false);
    expect(r.secrets.map((s) => s.kind).sort()).toEqual(['Anthropic API key', 'Stripe secret key']);
    expect(status['secrets']).toBe('error');
    expect(r.sourceMaps).toEqual(['https://shop.example/assets/app.js.map']);
    expect(status['source-maps']).toBe('warning');
    // The SPA answers 200 with its index.html for /.git/config: not counted.
    expect(r.exposedFiles.map((e) => e.path)).toEqual(['/.env', '/.git/HEAD']);
    expect(status['exposed-files']).toBe('error');
    expect(status['csp']).toBe('warning');
    expect(status['hsts']).toBe('warning');
    expect(status['framing']).toBe('warning');
    expect(status['disclosure']).toBe('info');
    expect(r.cookies.find((c) => c.name === 'sid')).toMatchObject({ session: true, httpOnly: false });
    expect(status['cookies']).toBe('error');
    expect(status['https']).toBe('ok');
    expect(r.mixedContent.sort()).toEqual(['http://api.example/x', 'http://insecure.example/a.png', 'http://insecure.example/style.css']);
    expect(status['forms']).toBe('error');
    expect(r.thirdParty.map((tp) => tp.host).sort()).toEqual(['cdn.jsdelivr.net', 'www.googletagmanager.com']);
    expect(r.thirdParty.flatMap((tp) => tp.withoutIntegrity)).toEqual(['https://cdn.jsdelivr.net/npm/lib@1/lib.min.js']);
    expect(status['sri']).toBe('warning');
    expect(seen.some((u) => u.endsWith('/.env'))).toBe(true);

    const prompt = securityPrompt(r);
    expect(prompt).toContain('Stripe secret key');
    expect(prompt).not.toContain(STRIPE);
    expect(prompt).toContain('vercel.json');
    expect(securitySummary(r)).toMatchObject({ headers: [], total: r.score.total });

    const { f: f2, seen: seen2 } = site('https://shop.example', routes);
    const noProbe = await auditSecurity('https://shop.example/', { fetchImpl: f2 });
    expect(noProbe.checks.find((c) => c.id === 'exposed-files')?.status).toBe('skip');
    expect(seen2.some((u) => u.includes('/.env') || u.includes('/.git'))).toBe(false);
  });

  it('a well-configured site passes; a dev server isn’t judged on its headers', async () => {
    const good: Record<string, Route> = {
      '/': {
        body: '<!doctype html><html><head><script src="/a.js"></script><script src="https://unpkg.com/x@1/x.js" integrity="sha384-abc" crossorigin="anonymous"></script></head><body></body></html>',
        headers: {
          'content-type': 'text/html',
          'strict-transport-security': 'max-age=63072000',
          'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=()',
        },
        cookies: ['session=1; Path=/; HttpOnly; Secure; SameSite=Lax'],
      },
      '/a.js': { body: 'console.log(1)' },
    };
    const { f } = site('https://good.example', good);
    const r = await auditSecurity('https://good.example/', { fetchImpl: f, probe: true });
    const bad = r.checks.filter((c) => c.status === 'error' || c.status === 'warning');
    expect(bad).toEqual([]);
    expect(r.score.passed).toBe(r.score.total);
    expect(securitySummary(r).headers).toEqual(['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy']);

    const { f: fl } = site('http://localhost:5173', { '/': { body: '<html><body></body></html>' } });
    const dev = await auditSecurity('http://localhost:5173/', { fetchImpl: fl });
    expect(dev.local).toBe(true);
    expect(['hsts', 'csp', 'nosniff', 'https', 'source-maps'].map((id) => dev.checks.find((c) => c.id === id)?.status)).toEqual(['skip', 'skip', 'skip', 'skip', 'skip']);
  });
});

describe('headersFix', () => {
  it('gives a snippet for the framework and for vercel.json', () => {
    const next = headersFix('next', ['content-security-policy', 'x-content-type-options']);
    expect(next.map((f) => f.file)).toEqual(['next.config.js', 'vercel.json']);
    expect(next[0]!.code).toContain('X-Content-Type-Options');
    expect(next[0]!.code).not.toContain('Strict-Transport-Security');
    expect(JSON.parse(next[1]!.code).headers[0].headers.length).toBe(2);
  });
});
