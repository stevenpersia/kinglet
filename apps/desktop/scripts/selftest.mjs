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

// 3. Display
let display = process.env.DISPLAY;
if (!display && !process.env.WAYLAND_DISPLAY) {
  display = ':99';
  const xvfb = spawn('Xvfb', [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  children.push(xvfb);
  await new Promise((r) => setTimeout(r, 800));
}

// 4. Parakeet
const args = ['.'];
if (process.getuid?.() === 0) args.push('--no-sandbox'); // Chromium refuses to sandbox as root (containers)
const app = spawn(electronBin, args, {
  cwd: appDir,
  env: {
    ...process.env,
    DISPLAY: display,
    PARAKEET_SELFTEST: outDir,
    PARAKEET_URL: 'http://localhost:5173/',
    PARAKEET_HMR_FILE: join(demoDir, 'content.js'),
    PARAKEET_VERCEL_BYPASS: 'secret-de-test',
    PARAKEET_BYPASS_HOSTS: '127.0.0.1',
    PARAKEET_ECHO_URL: 'http://127.0.0.1:5199/',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
children.push(app);

const timeout = setTimeout(() => {
  console.error('selftest: timeout');
  process.exit(1);
}, 90_000);

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
cleanup();
process.exit(report.criteria.some((c) => c.ok === false) || report.error ? 1 : 0);
