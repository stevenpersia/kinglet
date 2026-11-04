import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import { checkShare, probeImage, readPageMeta } from '@parakeet/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { DeviceManager } from './devices';
import { mcpLaunch } from './mcp-launch';

/**
 * Phase-0 acceptance run. Prints `SHOT:<name>` when the window should be captured
 * (scripts/selftest.mjs grabs the X display), then writes report.json and quits.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => Promise<boolean> | boolean, timeoutMs: number, stepMs = 200) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await cond()) return true;
    await sleep(stepMs);
  }
  return false;
}

const DIAG = `(() => ({
  innerWidth, innerHeight, dpr: devicePixelRatio,
  pointerCoarse: matchMedia('(pointer: coarse)').matches,
  hoverNone: matchMedia('(hover: none)').matches,
  maxTouchPoints: navigator.maxTouchPoints,
  ontouchstart: 'ontouchstart' in window,
  userAgent: navigator.userAgent,
  headline: document.getElementById('headline')?.textContent ?? null,
  scrollRatio: Math.max(0, document.documentElement.scrollHeight - innerHeight) ? scrollY / (document.documentElement.scrollHeight - innerHeight) : 0,
}))()`;

export async function runSelftest(win: BrowserWindow, devices: DeviceManager, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const report: Record<string, unknown> = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    sessionType: process.env.XDG_SESSION_TYPE ?? null,
    waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
  };
  const criteria: { id: string; ok: boolean | null; detail: string }[] = [];
  const shot = async (name: string) => {
    process.stdout.write(`SHOT:${name}\n`);
    await sleep(1200);
  };
  const evalAll = () => Promise.all(devices.entries().map(async (d) => ({ id: d.preset.id, preset: d.preset, ...(await d.view.webContents.executeJavaScript(DIAG)) })));

  try {
    win.setPosition(0, 0);
    const loaded = await waitFor(async () => {
      const es = devices.entries();
      return es.length > 0 && es.every((d) => !d.view.webContents.isLoading() && d.view.webContents.getURL().startsWith('http'));
    }, 20_000);
    await sleep(1500); // inspector fetch + fonts
    criteria.push({ id: 'devices-loaded', ok: loaded, detail: `${devices.entries().length} vues chargées sur ${devices.currentUrl}` });
    await shot('01-apercu');

    // 1. Emulation
    const diag = await evalAll();
    report['emulation'] = diag;
    for (const d of diag) {
      const p = d.preset;
      const ok = d.innerWidth === p.width && Math.abs(d.dpr - p.dpr) < 0.01 && d.pointerCoarse === p.touch && d.hoverNone === p.touch && (d.maxTouchPoints > 1) === p.touch;
      criteria.push({
        id: `emulation-${p.id}`,
        ok,
        detail: `largeur ${d.innerWidth}/${p.width}, dpr ${d.dpr}/${p.dpr}, pointer:coarse ${d.pointerCoarse}, hover:none ${d.hoverNone}, touch ${d.maxTouchPoints}`,
      });
    }

    // 2. Scroll sync
    const [first, ...others] = devices.entries();
    if (first && others.length) {
      await first.view.webContents.executeJavaScript('window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5)');
      let ratios: number[] = [];
      const synced = await waitFor(async () => {
        ratios = (await evalAll()).map((d) => +d.scrollRatio.toFixed(3));
        return ratios.every((r) => Math.abs(r - 0.5) < 0.05);
      }, 3000);
      criteria.push({ id: 'scroll-sync', ok: synced, detail: `ratios ${ratios.join(' / ')} (cible 0.5)` });
      await shot('02-scroll-synchro');
      await first.view.webContents.executeJavaScript('window.scrollTo(0, 0)');
      await sleep(500);
    }

    // 3. Hot reload
    const hmrFile = process.env.PARAKEET_HMR_FILE;
    if (hmrFile) {
      const original = readFileSync(hmrFile, 'utf8');
      const marker = 'Rechargé à chaud ✓';
      writeFileSync(hmrFile, `export const headline = '${marker}';\n`);
      const ok = await waitFor(async () => (await evalAll()).every((d) => d.headline === marker), 8000);
      criteria.push({ id: 'hot-reload', ok, detail: ok ? 'titre mis à jour dans toutes les vues sans recharger Parakeet' : 'titre non mis à jour' });
      await shot('03-rechargement-a-chaud');
      writeFileSync(hmrFile, original);
      await sleep(800);
    }

    // 4. Share tags read as the WhatsApp bot
    if (devices.currentUrl) {
      const meta = await readPageMeta(devices.currentUrl, { bot: 'whatsapp' });
      const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl) : null;
      const issues = checkShare(meta, image);
      report['share'] = { meta, image, issues };
      criteria.push({
        id: 'share-meta',
        ok: !!meta.title && issues.some((i) => i.id === 'og-site-name-missing'),
        detail: `titre « ${meta.title} », ${issues.length} problème(s) : ${issues.map((i) => i.id).join(', ')}`,
      });
    }

    // 5. Vercel protection bypass header injected in the preview session
    const echo = process.env.PARAKEET_ECHO_URL;
    if (echo) {
      const res = await devices.session.fetch(echo);
      const headers = (await res.json()) as Record<string, string>;
      criteria.push({
        id: 'vercel-bypass-header',
        ok: headers['x-vercel-protection-bypass'] === process.env.PARAKEET_VERCEL_BYPASS,
        detail: `en-tête reçu par le serveur : ${headers['x-vercel-protection-bypass'] ?? 'absent'} (test local, pas sur un vrai déploiement Vercel)`,
      });
    }

    // 6. Wayland
    criteria.push({
      id: 'wayland',
      ok: process.env.XDG_SESSION_TYPE === 'wayland' ? true : null,
      detail: process.env.XDG_SESSION_TYPE === 'wayland' ? 'session Wayland' : `session ${process.env.XDG_SESSION_TYPE ?? 'X11/Xvfb'} : à vérifier sur ta machine`,
    });

    // Window resize keeps devices aligned
    win.setSize(1180, 820);
    await sleep(1000);
    await shot('04-fenetre-redimensionnee');
    win.setSize(1440, 900);
    await sleep(600);

    // ---- Phase 1 ----
    const ui = (e: object) => win.webContents.send('app:event', e);

    // 7. Landscape, driven through the UI like the shortcut would
    ui({ type: 'shortcut', action: 'toggle-landscape' });
    const rotated = await waitFor(async () => (await evalAll()).every((d) => d.preset.kind === 'desktop' || d.innerWidth === d.preset.height), 5000);
    await sleep(800);
    await shot('05-paysage');
    criteria.push({ id: 'landscape', ok: rotated, detail: (await evalAll()).map((d) => `${d.id} ${d.innerWidth}×${d.innerHeight}`).join(', ') });
    await sleep(500); // settings are written 300 ms after a change
    const settingsFile = join(app.getPath('userData'), 'settings.json');
    let persisted = false;
    try {
      persisted = JSON.parse(readFileSync(settingsFile, 'utf8')).landscape === true;
    } catch {
      /* not written */
    }
    criteria.push({ id: 'settings-persisted', ok: persisted, detail: persisted ? 'paysage enregistré dans settings.json' : 'settings.json non mis à jour' });
    ui({ type: 'shortcut', action: 'toggle-landscape' });
    await waitFor(async () => (await evalAll()).every((d) => d.innerWidth === d.preset.width), 5000);

    // 8. Command palette over the stage: native views must be frozen (hidden, replaced by images)
    ui({ type: 'shortcut', action: 'palette' });
    const hidden = await waitFor(() => devices.entries().every((d) => !d.view.getVisible()), 3000);
    await sleep(600);
    await shot('06-palette');
    ui({ type: 'shortcut', action: 'palette' });
    const shown = await waitFor(() => devices.entries().every((d) => d.view.getVisible()), 3000);
    criteria.push({ id: 'palette-freeze', ok: hidden && shown, detail: `vues masquées pendant la palette : ${hidden}, réaffichées après : ${shown}` });

    // 9. Navigation sync: a link clicked in the first device is followed by the others
    if (first && others.length) {
      await first.view.webContents.executeJavaScript(`(document.getElementById('link-atelier-mobile') || document.getElementById('link-atelier')).click()`);
      const followed = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL().endsWith('/atelier.html')), 6000);
      await sleep(1200);
      await shot('07-navigation-synchro');
      criteria.push({ id: 'navigation-sync', ok: followed, detail: devices.entries().map((d) => `${d.preset.id} → ${new URL(d.view.webContents.getURL()).pathname}`).join(', ') });
    }

    // ---- Phase 2 ----
    type Report = { checks: { id: string; status: string; detail: string }[]; score: { passed: number; total: number } };
    const analyze = (url: string) => win.webContents.executeJavaScript(`window.parakeet.analyze(${JSON.stringify(url)})`) as Promise<Report>;

    // 11. Checks on a page with known defects (atelier.html, where devices are now)
    await sleep(1000);
    const atelier = await analyze('http://localhost:5173/atelier.html');
    const st = Object.fromEntries(atelier.checks.map((c) => [c.id, c.status]));
    criteria.push({
      id: 'checks-24',
      ok: atelier.checks.length === 24 && st['overflow'] === 'error' && st['console'] === 'error' && st['og-site-name'] === 'warning' && st['robots'] === 'warning',
      detail: `${atelier.checks.length} checks, ${atelier.score.passed}/${atelier.score.total} · débordement ${st['overflow']}, erreurs JS ${st['console']}, robots.txt ${st['robots']} (le serveur Vite renvoie sa page HTML)`,
    });
    report['checks-atelier'] = atelier.checks;

    // 12. Crawl: pages found from the links
    const pages = (await win.webContents.executeJavaScript(`window.parakeet.crawl('http://localhost:5173/', { force: true })`)) as { path: string }[];
    const paths = pages.map((p) => p.path);
    criteria.push({ id: 'crawl', ok: paths.includes('/') && paths.includes('/atelier.html'), detail: paths.join(', ') });

    // Back to the home page, then the Checks section
    ui({ type: 'shortcut', action: 'focus-url' });
    await devices.navigate('http://localhost:5173/');
    await sleep(2500);
    await shot('09-checks-inspecteur');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Checks'))?.click()`);
    await sleep(1200);
    await shot('10-section-checks');

    // ---- Phase 3 ----
    // 13. Share previews: 7 platforms, each fetched by its own bot, and a fix for the detected framework
    type Studio = { previews: { framework: string; cards: { platform: string; status: string; layout: string }[] }; fix: { code: string; changes: string[]; prompt: string } };
    const studio = (await win.webContents.executeJavaScript(`window.parakeet.sharePreviews('http://localhost:5173/')`)) as Studio;
    criteria.push({
      id: 'share-previews',
      ok: studio.previews.cards.length === 7 && studio.previews.framework === 'vite' && studio.fix.code.includes('og:site_name') && studio.fix.prompt.includes('index.html'),
      detail: `${studio.previews.framework} · ${studio.previews.cards.map((c) => `${c.platform}:${c.status}`).join(' ')} · ${studio.fix.changes.length} correction(s)`,
    });

    // ---- Phase 4 ----
    // 14. MCP: launch `parakeet --mcp` exactly like Claude Code would, and drive the app through it
    await devices.navigate('http://localhost:5173/');
    await sleep(1500);
    const { exe, args } = mcpLaunch();
    const transport = new StdioClientTransport({
      command: exe,
      args: [...args, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
      env: { ...process.env, PARAKEET_CONFIG_DIR: app.getPath('userData'), ELECTRON_RUN_AS_NODE: '', PARAKEET_SELFTEST: '' } as Record<string, string>,
      stderr: 'ignore',
    });
    const client = new Client({ name: 'selftest', version: '0' });
    try {
      await client.connect(transport);
      type R = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
      const tools = (await client.listTools()).tools.length;
      const status = (await client.callTool({ name: 'status', arguments: {} })) as R;
      const capture = (await client.callTool({ name: 'screenshot', arguments: { device: 'iphone-16' } })) as R;
      const checks = (await client.callTool({ name: 'run_checks', arguments: {} })) as R;
      const img = capture.content.find((c) => c.type === 'image')?.data ?? '';
      const statusText = status.content[0]?.text ?? '';
      const checksText = checks.content[0]?.text ?? '';
      if (img) writeFileSync(join(outDir, 'mcp-screenshot-iphone.jpg'), Buffer.from(img, 'base64'));
      criteria.push({
        id: 'mcp',
        ok: tools === 8 && statusText.includes('iPhone 16') && img.startsWith('/9j/') && /Checks pour .* \d+\/\d+/.test(checksText) && !checksText.includes('sans mesures'),
        detail: `${tools} outils · status « ${statusText.split('\n')[1] ?? ''} » · capture ${Math.round((img.length * 3) / 4 / 1024)} Ko · ${checksText.split('\n')[0]}`,
      });
    } catch (e) {
      criteria.push({ id: 'mcp', ok: false, detail: (e as Error).message });
    } finally {
      await client.close().catch(() => undefined);
    }
    await sleep(500);
    const statusBar = (await win.webContents.executeJavaScript(`document.querySelector('footer')?.textContent ?? ''`)) as string;
    criteria.push({ id: 'mcp-activity', ok: /MCP · \d+ appels/.test(statusBar), detail: statusBar.match(/MCP · \d+ appels?/)?.[0] ?? statusBar });
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Aperçu'))?.click()`);
    await sleep(600);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('MCP'))?.click()`);
    await sleep(600);
    await shot('11-inspecteur-mcp');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Réglages'))?.click()`);
    await sleep(800);
    await shot('12-reglages-mcp');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Aperçu'))?.click()`);
    await sleep(600);

    // 10. Partage section
    ui({ type: 'shortcut', action: 'focus-url' });
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Partage'))?.click()`);
    await sleep(1200);
    await shot('08-section-partage');
  } catch (e) {
    report['error'] = (e as Error).stack;
  }

  report['criteria'] = criteria;
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write('SELFTEST:DONE\n');
  app.quit();
}
