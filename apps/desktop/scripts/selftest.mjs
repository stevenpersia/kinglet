#!/usr/bin/env node
// Phase-0 acceptance run on Linux:
//   demo site (Vite) + echo server + Electron on a virtual X display, screenshots via ImageMagick.
// Usage: pnpm selftest   (needs Xvfb and ImageMagick's `import` when no display is available)
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const root = resolve(appDir, '../..');
const demoDir = join(root, 'fixtures/demo-site');
const outDir = join(appDir, 'selftest-output');
const electronBin = createRequire(join(appDir, 'package.json'))('electron');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const children = [];
const cleanup = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('exit', cleanup);

const waitForUrl = async (url, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout waiting for ${url}`);
};

// 1. Demo site
const vite = spawn(join(demoDir, 'node_modules/.bin/vite'), ['--port', '5173', '--strictPort', '--host', '127.0.0.1'], { cwd: demoDir, stdio: 'ignore' });
children.push(vite);
await waitForUrl('http://127.0.0.1:5173/');

// 2. Echo server (stands in for a protected Vercel deployment)
const echo = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(req.headers));
});
await new Promise((r) => echo.listen(5199, '127.0.0.1', r));

// 2b. Phase 5: a fake Vercel API, and two servers playing the preview and production deployments
const { startVercelMock, TOKEN: VERCEL_TOKEN } = await import(join(root, 'fixtures/vercel-mock/index.mjs'));
const envPage = (env, extra) => (req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${env === 'prod' ? 'Maison Sable' : 'Maison Sable — Céramiques faites main'}</title>${extra}</head>
<body style="font-family:system-ui;background:${env === 'prod' ? '#EEF2EE' : '#F6F2EC'};margin:0;padding:24px"><p style="font:600 12px system-ui;letter-spacing:.1em;color:#2F5D50">${env.toUpperCase()}</p><h1 id="headline">Maison Sable (${env})</h1><p id="path">${req.url}</p><p id="bypass">${req.headers['x-vercel-protection-bypass'] ?? ''}</p></body></html>`);
};
// The preview behaves like a protected Vercel deployment: 401 without the bypass secret; with
// x-vercel-set-bypass-cookie, a redirect to itself that sets a cookie (browsers keep it, bots must not ask).
const previewPage = envPage('preview', '<meta property="og:title" content="Maison Sable"><meta property="og:site_name" content="Maison Sable"><meta name="twitter:card" content="summary_large_image">');
const SECRETS = ['secret-de-test', 'mock-bypass-secret'];
const preview = createServer((req, res) => {
  // Like Vercel: the secret in a header or in the query string; with set-bypass-cookie, a redirect
  // that sets a cookie, which is then enough on its own.
  const url = new URL(req.url, 'http://x');
  const secret = req.headers['x-vercel-protection-bypass'] ?? url.searchParams.get('x-vercel-protection-bypass');
  const hasCookie = String(req.headers.cookie ?? '').includes('_vercel_jwt=ok');
  const wantsCookie = req.headers['x-vercel-set-bypass-cookie'] ?? url.searchParams.get('x-vercel-set-bypass-cookie');
  if (!hasCookie && !SECRETS.includes(secret)) {
    res.writeHead(401, { 'content-type': 'text/html' });
    return res.end('<html><head><title>Authentication Required</title></head><body>Vercel</body></html>');
  }
  if (wantsCookie && !hasCookie) {
    url.searchParams.delete('x-vercel-protection-bypass');
    url.searchParams.delete('x-vercel-set-bypass-cookie');
    res.writeHead(307, { location: url.pathname + url.search, 'set-cookie': '_vercel_jwt=ok; Path=/; HttpOnly; SameSite=Lax' });
    return res.end();
  }
  previewPage(req, res);
});
const prod = createServer(envPage('prod', '<meta property="og:title" content="Maison Sable"><meta name="robots" content="noindex">'));
await new Promise((r) => preview.listen(5176, '127.0.0.1', r));
await new Promise((r) => prod.listen(5175, '127.0.0.1', r));
const vercelMock = await startVercelMock({ previewUrl: 'http://127.0.0.1:5176', previewUrl2: 'http://127.0.0.1:5176', prodUrl: 'http://127.0.0.1:5175' });

// 2c. Phase 7: a fake update feed (generic provider) announcing 9.9.9 with a real sha512
const { createHash } = await import('node:crypto');
const fakePkg = Buffer.from('not a real package, only downloaded and verified');
const sha512 = createHash('sha512').update(fakePkg).digest('base64');
const feed = createServer((req, res) => {
  if (req.url.startsWith('/latest-linux.yml')) {
    res.writeHead(200, { 'content-type': 'text/yaml' });
    return res.end(`version: 9.9.9\nfiles:\n  - url: Parakeet-9.9.9-x64.pacman\n    sha512: ${sha512}\n    size: ${fakePkg.length}\n  - url: Parakeet-9.9.9-x86_64.AppImage\n    sha512: ${sha512}\n    size: ${fakePkg.length}\npath: Parakeet-9.9.9-x86_64.AppImage\nsha512: ${sha512}\nreleaseDate: '2026-11-04T00:00:00.000Z'\n`);
  }
  if (req.url.startsWith('/Parakeet-9.9.9')) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fakePkg.length });
    return res.end(fakePkg);
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => feed.listen(5198, '127.0.0.1', r));

// 3. Display
let display = process.env.DISPLAY;
if (!display && !process.env.WAYLAND_DISPLAY) {
  display = ':99';
  const xvfb = spawn('Xvfb', [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  children.push(xvfb);
  await new Promise((r) => setTimeout(r, 800));
}

// 4. Parakeet
// PARAKEET_BIN=dist/linux-unpacked/parakeet runs the acceptance test against the packaged app.
const packaged = process.env.PARAKEET_BIN ? resolve(appDir, process.env.PARAKEET_BIN) : null;
const args = packaged ? [] : ['.'];
if (process.getuid?.() === 0) args.push('--no-sandbox'); // Chromium refuses to sandbox as root (containers)
const app = spawn(packaged ?? electronBin, args, {
  cwd: appDir,
  env: {
    ...process.env,
    DISPLAY: display,
    PARAKEET_SELFTEST: outDir,
    PARAKEET_URL: 'http://localhost:5173/',
    PARAKEET_HMR_FILE: join(demoDir, 'content.js'),
    PARAKEET_VERCEL_BYPASS: 'secret-de-test',
    PARAKEET_BYPASS_HOSTS: '127.0.0.1',  // the fake deployments and the echo server
    PARAKEET_ECHO_URL: 'http://127.0.0.1:5199/',
    PARAKEET_VERCEL_API: vercelMock.url,
    PARAKEET_UPDATE_URL: 'http://127.0.0.1:5198/',
    PARAKEET_VERCEL_TEST_TOKEN: VERCEL_TOKEN,
    PARAKEET_CLAUDE_BIN: join(root, 'fixtures/fake-claude/claude'),
    PARAKEET_DEMO_DIR: demoDir,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
children.push(app);

const timeout = setTimeout(() => {
  console.error('selftest: timeout');
  process.exit(1);
}, 180_000);

for await (const line of createInterface({ input: app.stdout })) {
  if (line.startsWith('SHOT:')) {
    const name = line.slice(5).trim();
    try {
      execFileSync('import', ['-display', display, '-window', 'root', '-crop', '1440x900+0+0', '+repage', join(outDir, `${name}.png`)]);
      console.log(`  capture ${name}.png`);
    } catch (e) {
      console.error(`  capture ${name} impossible : ${e.message}`);
    }
  } else if (line.startsWith('SELFTEST:DONE')) break;
  else if (line.trim()) console.log(`  [app] ${line}`);
}
clearTimeout(timeout);

const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
console.log('\nCritères phase 0');
for (const c of report.criteria) console.log(`  ${c.ok === true ? '✔' : c.ok === false ? '✘' : '…'} ${c.id.padEnd(22)} ${c.detail}`);
if (report.error) console.log(`\nErreur : ${report.error}`);
echo.close();
feed.close();
preview.close();
prod.close();
await vercelMock.close();
cleanup();
process.exit(report.criteria.some((c) => c.ok === false) || report.error ? 1 : 0);
