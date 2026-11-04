import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, safeStorage } from 'electron';
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
        ok: tools === 9 && statusText.includes('iPhone 16') && img.startsWith('/9j/') && /Checks pour .* \d+\/\d+/.test(checksText) && !checksText.includes('sans mesures'),
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

    // ---- Phase 5 ----
    // 15. Vercel: connect with a token, link the project, deployments loaded (fake API)
    const js = <T,>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
    const clickText = (selector: string, text: string) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`);
    await js(`window.parakeet.vercel.connect(${JSON.stringify(process.env.PARAKEET_VERCEL_TEST_TOKEN ?? '')})`);
    const linked = (await js(`window.parakeet.vercel.link('prj_maisonsable')`)) as { project: { productionUrl: string } | null; deployments: unknown[] };
    await sleep(800);
    criteria.push({
      id: 'vercel-link',
      ok: linked.project?.productionUrl === 'http://127.0.0.1:5175' && linked.deployments.length === 6,
      detail: `prod ${linked.project?.productionUrl}, ${linked.deployments.length} déploiements`,
    });
    // Encrypted when a keyring exists; otherwise clear text, but readable by the user only.
    const vercelFile = join(app.getPath('userData'), 'vercel.json');
    const stored = JSON.parse(readFileSync(vercelFile, 'utf8')) as { encrypted: boolean; token: string };
    const mode = statSync(vercelFile).mode & 0o777;
    const tokenOk = stored.encrypted ? stored.token !== process.env.PARAKEET_VERCEL_TEST_TOKEN : !safeStorage.isEncryptionAvailable() && mode === 0o600;
    criteria.push({ id: 'vercel-token-stored', ok: tokenOk, detail: stored.encrypted ? 'jeton chiffré (trousseau)' : `pas de trousseau ici : jeton en clair, fichier ${mode.toString(8)}` });

    // 16. Environment switch keeps the page: local /atelier.html → prod /atelier.html → preview
    await devices.navigate('http://localhost:5173/atelier.html');
    await sleep(1500);
    await clickText('[aria-label=Environnement] button', 'Prod');
    const onProd = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://127.0.0.1:5175/atelier.html'), 6000);
    await sleep(800);
    await shot('13-env-prod');
    await clickText('[aria-label=Environnement] button', 'Preview');
    const onPreview = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://127.0.0.1:5176/atelier.html'), 6000);
    // Protected preview: devices pass (cookie), and the 7 bots read it too (no cookie header for them).
    const previewTitle = (await devices.entries()[0]!.view.webContents.executeJavaScript('document.title')) as string;
    const protectedShare = (await js(`window.parakeet.sharePreviews('http://127.0.0.1:5176/atelier.html')`)) as { previews: { cards: { httpStatus: number | null }[] } };
    const statuses = protectedShare.previews.cards.map((c) => c.httpStatus);
    criteria.push({
      id: 'protected-preview',
      ok: !previewTitle.includes('Authentication') && statuses.length === 7 && statuses.every((x) => x === 200),
      detail: `appareils : « ${previewTitle} » · robots : ${statuses.join(', ')}`,
    });
    await clickText('[aria-label=Environnement] button', 'Local');
    const backLocal = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://localhost:5173/atelier.html'), 6000);
    criteria.push({ id: 'env-switch', ok: onProd && onPreview && backLocal, detail: `prod ${onProd}, preview ${onPreview}, retour local ${backLocal} (même chemin /atelier.html)` });

    // 17. Bypass secret taken from the Vercel project (once the env variable is gone)
    process.env.PARAKEET_VERCEL_BYPASS = '';
    await js(`window.parakeet.vercel.generateBypass()`);
    const echoed = (await (await devices.session.fetch(process.env.PARAKEET_ECHO_URL ?? '')).json()) as Record<string, string>;
    criteria.push({ id: 'vercel-bypass-project', ok: echoed['x-vercel-protection-bypass'] === 'mock-bypass-secret', detail: `en-tête : ${echoed['x-vercel-protection-bypass'] ?? 'absent'}` });

    // 18. Compare: same path on the three environments, differences found
    type Col = { env: string; values: Record<string, string | null>; score: { passed: number } | null };
    const cols = (await js(
      `window.parakeet.compare([{env:'local',label:'Local',url:'http://localhost:5173/'},{env:'preview',label:'Preview',url:'http://127.0.0.1:5176/'},{env:'prod',label:'Prod',url:'http://127.0.0.1:5175/'}])`,
    )) as Col[];
    const titles = cols.map((c) => c.values['title']);
    criteria.push({
      id: 'compare',
      ok: cols.length === 3 && new Set(titles).size === 2 && cols[2]!.values['robots'] === 'noindex' && cols.every((c) => c.score),
      detail: cols.map((c) => `${c.env}: « ${c.values['title']} » ${c.score?.passed ?? '?'} ok`).join(' · '),
    });

    await clickText('nav button', 'Déploiements');
    await sleep(900);
    await shot('14-deploiements');
    await clickText('nav button', 'Comparer');
    await sleep(2500);
    await shot('15-comparer');
    await clickText('nav button', 'Réglages');
    await sleep(800);
    await js(`document.querySelector('main')?.scrollTo(0, 99999)`);
    await sleep(400);
    await shot('16-reglages-vercel');
    await clickText('nav button', 'Aperçu');
    await sleep(600);

    // ---- Phase 6 ----
    // 19. On my phone: a hidden Chromium window plays the phone (scans the QR code)
    type Phone = { running: boolean; port: number; address: string; clients: unknown[] };
    await devices.navigate('http://localhost:5173/');
    await sleep(1200);
    const phoneOn = (await js(`window.parakeet.phone.start()`)) as Phone;
    const qr = (await js(`window.parakeet.phone.qr('http://localhost:5173/', true)`)) as { url: string; svg: string };
    const unpaired = await fetch(`http://${phoneOn.address}:${phoneOn.port}/`).then((r) => r.status);
    const phoneWin = new BrowserWindow({ show: false, width: 393, height: 852, webPreferences: { backgroundThrottling: false } });
    const phoneLog: string[] = [];
    phoneWin.webContents.on('console-message', (e) => phoneLog.push((e as unknown as { message: string }).message));
    try {
      await phoneWin.loadURL(qr.url);
      const phoneJs = <T,>(code: string) => phoneWin.webContents.executeJavaScript(code) as Promise<T>;
      const loadedOnPhone = await waitFor(async () => (await phoneJs<string>('document.title')).includes('Maison Sable'), 8000);
      // Hot reload through the proxy (WebSocket)
      let hmrOnPhone = false;
      if (hmrFile) {
        // The page loads before Vite's WebSocket is connected: wait for it, or the change is missed.
        await waitFor(() => phoneLog.some((m) => m.includes('[vite] connected')), 8000);
        const original = readFileSync(hmrFile, 'utf8');
        writeFileSync(hmrFile, `export const headline = 'Vu sur le téléphone ✓';\n`);
        hmrOnPhone = await waitFor(async () => (await phoneJs<string | null>(`document.getElementById('headline')?.textContent ?? null`)) === 'Vu sur le téléphone ✓', 8000);
        writeFileSync(hmrFile, original);
        await sleep(800);
      }
      // Follow Parakeet's navigation
      await devices.navigate('http://localhost:5173/atelier.html');
      const followed = await waitFor(() => phoneWin.webContents.getURL().endsWith('/atelier.html'), 8000);
      // After a navigation the phone reconnects to the follow channel: wait for it.
      let state = (await js(`window.parakeet.phone.state()`)) as Phone;
      await waitFor(async () => (state = (await js(`window.parakeet.phone.state()`)) as Phone).clients.length >= 1, 5000);
      criteria.push({
        id: 'phone',
        ok: qr.svg.startsWith('<svg') && unpaired === 403 && loadedOnPhone && hmrOnPhone && followed && state.clients.length >= 1,
        detail: `${hmrOnPhone ? '' : `[console : ${phoneLog.slice(-3).join(' | ')}] `}${phoneOn.address}:${phoneOn.port} · non appairé ${unpaired} · page ${loadedOnPhone} · rechargement à chaud ${hmrOnPhone} · suit la navigation ${followed} · ${state.clients.length} appareil(s)`,
      });
      // Online pages: direct QR, with the bypass secret for a protected preview only
      const prodQr = (await js(`window.parakeet.phone.qr('http://127.0.0.1:5175/', false)`)) as { url: string; withSecret: boolean };
      const previewQr = (await js(`window.parakeet.phone.qr('http://127.0.0.1:5176/', false)`)) as { url: string; withSecret: boolean };
      const previewPhone = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
      await previewPhone.loadURL(previewQr.url);
      const previewTitle = (await previewPhone.webContents.executeJavaScript('document.title')) as string;
      previewPhone.destroy();
      criteria.push({
        id: 'phone-online',
        // (the fake prod runs on 127.0.0.1, which this test sends the secret to: only the preview is checked)
        ok: prodQr.url.startsWith('http://127.0.0.1:5175/') && previewQr.withSecret && previewTitle.includes('Maison Sable'),
        detail: `prod ${prodQr.url} · preview protégée : secret dans le lien ${previewQr.withSecret}, ouverte « ${previewTitle} »`,
      });
    } finally {
      phoneWin.destroy();
    }
    await devices.navigate('http://localhost:5173/');
    await sleep(1200);
    await clickText('header button', 'Sur mon téléphone');
    await sleep(1500);
    await shot('17-telephone');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    const closed = await waitFor(async () => !(await js<boolean>(`!!document.querySelector('[aria-label="Sur mon téléphone"][role=dialog]')`)) && devices.entries().every((d) => d.view.getVisible()), 3000);
    criteria.push({ id: 'phone-dialog', ok: closed, detail: closed ? 'fermé avec Échap, aperçus réaffichés' : 'toujours ouvert' });
    await js(`window.parakeet.phone.stop()`);

    // 20. Title bar fits at any window width (worst case: a preview with a long branch name)
    await clickText('nav button', 'Aperçu');
    await clickText('[aria-label=Environnement] button', 'Preview');
    await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL().startsWith('http://127.0.0.1:5176')), 6000);
    await sleep(800);
    const fits: string[] = [];
    let allFit = true;
    for (const width of [1600, 1280, 960]) {
      win.setSize(width, 820);
      await sleep(700);
      const m = await js<{ overflow: number; wrapped: string[]; url: number }>(`(() => {
        const h = document.querySelector('header');
        const wrapped = [...h.querySelectorAll('button, form, [role=group]')].filter((el) => !el.closest('[data-window-controls]') && el.getBoundingClientRect().height > 32).map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24));
        return { overflow: h.scrollWidth - h.clientWidth, wrapped, url: h.querySelector('form').getBoundingClientRect().width };
      })()`);
      const ok = m.overflow <= 0 && m.wrapped.length === 0 && m.url >= 150;
      allFit &&= ok;
      fits.push(`${width}px : ${ok ? 'ok' : `débordement ${m.overflow}, sur 2 lignes [${m.wrapped.join(', ')}], adresse ${Math.round(m.url)} px`}`);
      await shot(`18-barre-${width}`);
    }
    criteria.push({ id: 'titlebar-fits', ok: allFit, detail: fits.join(' · ') });
    win.setSize(1440, 900);
    await clickText('[aria-label=Environnement] button', 'Local');
    await sleep(1000);

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
