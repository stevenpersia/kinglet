import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { app, BrowserWindow, safeStorage } from 'electron';
import { checkShare, probeImage, readPageMeta } from '@kinglet/core';
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
  // Captures: scripts/selftest.mjs grabs the display and answers SHOT-DONE:<name> on stdin.
  // KINGLET_SELFTEST_SHOTS=0 skips them, and the waits that only let the screen settle for them.
  const shots = process.env.KINGLET_SELFTEST_SHOTS !== '0';
  const acks = new Map<string, () => void>();
  if (shots) createInterface({ input: process.stdin }).on('line', (l) => l.startsWith('SHOT-DONE:') && acks.get(l.slice(10).trim())?.());
  // Without captures, a short wait remains: some steps rely on the page having settled.
  const settle = (ms: number) => sleep(shots ? ms : Math.min(ms, 300));
  const shot = async (name: string) => {
    if (!shots) return;
    const done = new Promise<void>((r) => acks.set(name, r));
    process.stdout.write(`SHOT:${name}\n`);
    await Promise.race([done, sleep(5000)]);
    acks.delete(name);
  };
  const evalAll = () => Promise.all(devices.entries().map(async (d) => ({ id: d.preset.id, preset: d.preset, ...(await d.view.webContents.executeJavaScript(DIAG)) })));

  try {
    win.setPosition(0, 0);
    const loaded = await waitFor(async () => {
      const es = devices.entries();
      return es.length > 0 && es.every((d) => !d.view.webContents.isLoading() && d.view.webContents.getURL().startsWith('http'));
    }, 20_000);
    // First run: the guided setup opens over the devices; it can be skipped.
    const ui0 = <T,>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
    const onboardingShown = await waitFor(() => ui0<boolean>(`!!document.querySelector('[role=dialog][aria-modal=true] [role=tablist]')`), 5000);
    await shot('00-accueil-guide');
    await ui0(`[...document.querySelectorAll('[role=dialog] [role=tab]')].find((b) => b.textContent.includes('Claude'))?.click()`);
    await settle(500);
    await shot('00b-accueil-claude');
    const fakeFound = await ui0<boolean>(`document.querySelector('[role=dialog]')?.textContent.includes('9.9.9') ?? false`);
    await ui0(`window.kinglet.updateSettings({ onboarded: true })`);
    const onboardingGone = await waitFor(async () => !(await ui0<boolean>(`!!document.querySelector('[role=dialog][aria-modal=true]')`)) && devices.entries().every((d) => d.view.getVisible()), 5000);
    criteria.push({ id: 'onboarding', ok: onboardingShown && onboardingGone && fakeFound, detail: `affiché ${onboardingShown} · Claude Code trouvé ${fakeFound} · passé ${onboardingGone}` });
    await sleep(1500); // inspector fetch + fonts; the pages settle before the scroll sync test
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
      let ratios: number[] = [];
      let tries = 0;
      // Scrolled again (1 px apart) until the others follow: the sync may not be listening yet on a slow machine.
      const synced = await waitFor(async () => {
        if (tries++ % 3 === 0) await first.view.webContents.executeJavaScript(`window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5 + ${tries % 2})`);
        ratios = (await evalAll()).map((d) => +d.scrollRatio.toFixed(3));
        return ratios.every((r) => Math.abs(r - 0.5) < 0.05);
      }, 6000);
      criteria.push({ id: 'scroll-sync', ok: synced, detail: `ratios ${ratios.join(' / ')} (cible 0.5)` });
      await shot('02-scroll-synchro');
      await first.view.webContents.executeJavaScript('window.scrollTo(0, 0)');
      await sleep(500);
    }

    // 3. Hot reload
    const hmrFile = process.env.KINGLET_HMR_FILE;
    if (hmrFile) {
      const original = readFileSync(hmrFile, 'utf8');
      const marker = 'Rechargé à chaud ✓';
      writeFileSync(hmrFile, `export const headline = '${marker}';\n`);
      const ok = await waitFor(async () => (await evalAll()).every((d) => d.headline === marker), 8000);
      criteria.push({ id: 'hot-reload', ok, detail: ok ? 'titre mis à jour dans toutes les vues sans recharger Kinglet' : 'titre non mis à jour' });
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
    const echo = process.env.KINGLET_ECHO_URL;
    if (echo) {
      const res = await devices.session.fetch(echo);
      const headers = (await res.json()) as Record<string, string>;
      criteria.push({
        id: 'vercel-bypass-header',
        ok: headers['x-vercel-protection-bypass'] === process.env.KINGLET_VERCEL_BYPASS,
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
    await settle(1000);
    await shot('04-fenetre-redimensionnee');
    win.setSize(1440, 900);
    await sleep(600);

    // ---- Phase 1 ----
    const ui = (e: object) => win.webContents.send('app:event', e);

    // 7. Landscape, driven through the UI like the shortcut would
    ui({ type: 'shortcut', action: 'toggle-landscape' });
    const rotated = await waitFor(async () => (await evalAll()).every((d) => d.preset.kind === 'desktop' || d.innerWidth === d.preset.height), 5000);
    await settle(800);
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
    await settle(600);
    await shot('06-palette');
    ui({ type: 'shortcut', action: 'palette' });
    const shown = await waitFor(() => devices.entries().every((d) => d.view.getVisible()), 3000);
    criteria.push({ id: 'palette-freeze', ok: hidden && shown, detail: `vues masquées pendant la palette : ${hidden}, réaffichées après : ${shown}` });

    // 9. Navigation sync: a link clicked in the first device is followed by the others
    if (first && others.length) {
      await first.view.webContents.executeJavaScript(`(document.getElementById('link-atelier-mobile') || document.getElementById('link-atelier')).click()`);
      const followed = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL().endsWith('/atelier.html')), 6000);
      await settle(1200);
      await shot('07-navigation-synchro');
      criteria.push({ id: 'navigation-sync', ok: followed, detail: devices.entries().map((d) => `${d.preset.id} → ${new URL(d.view.webContents.getURL()).pathname}`).join(', ') });
    }

    // ---- Phase 2 ----
    type Report = { checks: { id: string; status: string; detail: string }[]; score: { passed: number; total: number } };
    const analyze = (url: string) => win.webContents.executeJavaScript(`window.kinglet.analyze(${JSON.stringify(url)})`) as Promise<Report>;

    // 11. Checks on a page with known defects (atelier.html, where devices are now)
    await sleep(1000);
    const atelier = await analyze('http://localhost:5173/atelier.html');
    const st = Object.fromEntries(atelier.checks.map((c) => [c.id, c.status]));
    criteria.push({
      id: 'checks-37',
      ok: atelier.checks.length === 37 && st['overflow'] === 'error' && st['console'] === 'error' && st['og-site-name'] === 'warning' && st['robots'] === 'warning',
      detail: `${atelier.checks.length} checks, ${atelier.score.passed}/${atelier.score.total} · débordement ${st['overflow']}, erreurs JS ${st['console']}, robots.txt ${st['robots']} (le serveur Vite renvoie sa page HTML)`,
    });
    // Measured in the devices: the « mentions » link of atelier.html is tiny and pale on purpose.
    const det = (id: string) => atelier.checks.find((c) => c.id === id)?.detail ?? '';
    criteria.push({
      id: 'checks-mobile',
      ok: st['tap-targets'] === 'warning' && st['small-text'] === 'warning' && st['contrast'] === 'warning' && st['safe-area'] === 'ok' && det('tap-targets').includes('mentions') && st['lcp'] !== 'skip' && st['cls'] !== 'skip',
      detail: ['tap-targets', 'small-text', 'contrast', 'safe-area', 'lcp', 'cls'].map((id) => `${id} ${st[id]}: ${det(id)}`).join(' · '),
    });
    report['checks-atelier'] = atelier.checks;

    // 12. Crawl: pages found from the links
    const pages = (await win.webContents.executeJavaScript(`window.kinglet.crawl('http://localhost:5173/', { force: true })`)) as { path: string }[];
    const paths = pages.map((p) => p.path);
    criteria.push({ id: 'crawl', ok: paths.includes('/') && paths.includes('/atelier.html'), detail: paths.join(', ') });

    // Back to the home page, then the Checks section
    ui({ type: 'shortcut', action: 'focus-url' });
    await devices.navigate('http://localhost:5173/');
    await settle(2500);
    await shot('09-appareils');
    // Checks opens as a panel next to the devices, from the left bar.
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Checks'))?.click()`);
    await settle(1200);
    await shot('10-panneau-checks');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Checks'))?.click()`);

    // ---- Phase 3 ----
    // 13. Share previews: 7 platforms, each fetched by its own bot, and a fix for the detected framework
    type Studio = { previews: { framework: string; cards: { platform: string; status: string; layout: string }[] }; fix: { code: string; changes: string[]; prompt: string } };
    const studio = (await win.webContents.executeJavaScript(`window.kinglet.sharePreviews('http://localhost:5173/')`)) as Studio;
    criteria.push({
      id: 'share-previews',
      ok: studio.previews.cards.length === 10 && studio.previews.framework === 'vite' && studio.fix.code.includes('og:site_name') && studio.fix.prompt.includes('index.html'),
      detail: `${studio.previews.framework} · ${studio.previews.cards.map((c) => `${c.platform}:${c.status}`).join(' ')} · ${studio.fix.changes.length} correction(s)`,
    });

    // ---- Phase 4 ----
    // 14. MCP: launch `kinglet --mcp` exactly like Claude Code would, and drive the app through it
    await devices.navigate('http://localhost:5173/');
    await sleep(1500);
    const { exe, args } = mcpLaunch();
    // The packaged `kinglet --mcp` asks for a license: one checked just now, as after an activation.
    const licenseFile = join(app.getPath('userData'), 'license.json');
    if (!existsSync(licenseFile))
      writeFileSync(licenseFile, JSON.stringify({ key: 'KINGLET_SELFTEST', encrypted: false, instanceId: 'selftest', instanceName: 'selftest', email: null, customer: null, activationLimit: 3, validatedAt: Date.now() }), { mode: 0o600 });
    const transport = new StdioClientTransport({
      command: exe,
      args: [...args, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
      env: { ...process.env, KINGLET_CONFIG_DIR: app.getPath('userData'), ELECTRON_RUN_AS_NODE: '', KINGLET_SELFTEST: '' } as Record<string, string>,
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
        ok: tools === 14 && statusText.includes('iPhone 16') && img.startsWith('/9j/') && /Checks for .* \d+\/\d+/.test(checksText) && !checksText.includes('without measures'),
        detail: `${tools} outils · status « ${statusText.split('\n')[1] ?? ''} » · capture ${Math.round((img.length * 3) / 4 / 1024)} Ko · ${checksText.split('\n')[0]}`,
      });
    } catch (e) {
      criteria.push({ id: 'mcp', ok: false, detail: (e as Error).message });
    } finally {
      await client.close().catch(() => undefined);
    }
    await sleep(500);
    const statusBar = (await win.webContents.executeJavaScript(`document.querySelector('footer')?.textContent ?? ''`)) as string;
    criteria.push({ id: 'mcp-activity', ok: /MCP · \d+ calls/.test(statusBar), detail: statusBar.match(/MCP · \d+ calls?/)?.[0] ?? statusBar });
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Devices'))?.click()`);
    await sleep(600);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Settings'))?.click()`);
    await sleep(300);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[aria-label="Settings pages"] button')].find((b) => b.textContent.includes('Claude in terminal'))?.click()`);
    await settle(800);
    await shot('12-reglages-mcp');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Devices'))?.click()`);
    await sleep(600);

    // ---- Phase 5 ----
    // 15. Vercel: connect with a token, link the project, deployments loaded (fake API)
    const js = <T,>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
    const clickText = (selector: string, text: string) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => (b.getAttribute('aria-label') || b.textContent).includes(${JSON.stringify(text)}))?.click()`);
    await js(`window.kinglet.vercel.connect(${JSON.stringify(process.env.KINGLET_VERCEL_TEST_TOKEN ?? '')})`);
    // Link the active project to its Vercel project, from the settings page.
    type V = { projects: { id: string; productionUrl: string | null }[]; deployments: Record<string, unknown[]> };
    await clickText('nav button', 'Settings');
    await clickText('[aria-label="Settings pages"] button', 'Active project');
    await waitFor(() => js<boolean>(`!!document.querySelector('select[aria-label="Vercel project"] option[value=prj_maisonsable]')`), 5000);
    await js(`(() => {
      const el = document.querySelector('select[aria-label="Vercel project"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'prj_maisonsable');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(async () => (await js<V>(`window.kinglet.vercel.state()`)).deployments['prj_maisonsable']?.length === 6, 6000);
    const vs = await js<V>(`window.kinglet.vercel.state()`);
    const linkedProject = vs.projects.find((p) => p.id === 'prj_maisonsable');
    const linkedCount = vs.deployments['prj_maisonsable']?.length ?? 0;
    criteria.push({
      id: 'vercel-link',
      ok: linkedProject?.productionUrl === 'http://127.0.0.1:5175' && linkedCount === 6,
      detail: `prod ${linkedProject?.productionUrl}, ${linkedCount} déploiements suivis pour le projet actif`,
    });
    await shot('13-reglages-projet');
    await clickText('nav button', 'Devices');
    await sleep(500);
    // Encrypted when a keyring exists; otherwise clear text, but readable by the user only.
    const vercelFile = join(app.getPath('userData'), 'vercel.json');
    const stored = JSON.parse(readFileSync(vercelFile, 'utf8')) as { encrypted: boolean; token: string };
    const mode = statSync(vercelFile).mode & 0o777;
    const tokenOk = stored.encrypted ? stored.token !== process.env.KINGLET_VERCEL_TEST_TOKEN : !safeStorage.isEncryptionAvailable() && mode === 0o600;
    criteria.push({ id: 'vercel-token-stored', ok: tokenOk, detail: stored.encrypted ? 'jeton chiffré (trousseau)' : `pas de trousseau ici : jeton en clair, fichier ${mode.toString(8)}` });

    // 16. Environment switch keeps the page: local /atelier.html → prod /atelier.html → preview
    await devices.navigate('http://localhost:5173/atelier.html');
    await sleep(1500);
    await clickText('[aria-label=Environment] button', 'Prod');
    const onProd = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://127.0.0.1:5175/atelier.html'), 6000);
    await settle(800);
    await shot('13-env-prod');
    await clickText('[aria-label=Environment] button', 'Preview');
    const onPreview = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://127.0.0.1:5176/atelier.html'), 6000);
    // Protected preview: devices pass (cookie), and the 7 bots read it too (no cookie header for them).
    const previewTitle = (await devices.entries()[0]!.view.webContents.executeJavaScript('document.title')) as string;
    const protectedShare = (await js(`window.kinglet.sharePreviews('http://127.0.0.1:5176/atelier.html')`)) as { previews: { cards: { httpStatus: number | null }[] } };
    const statuses = protectedShare.previews.cards.map((c) => c.httpStatus);
    criteria.push({
      id: 'protected-preview',
      ok: !previewTitle.includes('Authentication') && statuses.length === 10 && statuses.every((x) => x === 200),
      detail: `appareils : « ${previewTitle} » · robots : ${statuses.join(', ')}`,
    });
    await clickText('[aria-label=Environment] button', 'Local');
    const backLocal = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://localhost:5173/atelier.html'), 6000);
    criteria.push({ id: 'env-switch', ok: onProd && onPreview && backLocal, detail: `prod ${onProd}, preview ${onPreview}, retour local ${backLocal} (même chemin /atelier.html)` });

    // 17. Bypass secret taken from the Vercel project (once the env variable is gone)
    process.env.KINGLET_VERCEL_BYPASS = '';
    await js(`window.kinglet.vercel.generateBypass('prj_maisonsable')`);
    const echoed = (await (await devices.session.fetch(process.env.KINGLET_ECHO_URL ?? '')).json()) as Record<string, string>;
    criteria.push({ id: 'vercel-bypass-project', ok: echoed['x-vercel-protection-bypass'] === 'mock-bypass-secret', detail: `en-tête : ${echoed['x-vercel-protection-bypass'] ?? 'absent'}` });

    // 18. Compare: same path on the three environments, differences found
    type Col = { env: string; values: Record<string, string | null>; score: { passed: number } | null };
    const cols = (await js(
      `window.kinglet.compare([{env:'local',label:'Local',url:'http://localhost:5173/'},{env:'preview',label:'Preview',url:'http://127.0.0.1:5176/'},{env:'prod',label:'Prod',url:'http://127.0.0.1:5175/'}])`,
    )) as Col[];
    const titles = cols.map((c) => c.values['title']);
    criteria.push({
      id: 'compare',
      ok: cols.length === 3 && new Set(titles).size === 2 && cols[2]!.values['robots'] === 'noindex' && cols.every((c) => c.score),
      detail: cols.map((c) => `${c.env}: « ${c.values['title']} » ${c.score?.passed ?? '?'} ok`).join(' · '),
    });

    // GitHub: the pull request of each preview branch, with its CI.
    await js(`window.kinglet.github.connect(${JSON.stringify(process.env.KINGLET_VERCEL_TEST_TOKEN ?? '')})`);
    await sleep(300);
    await clickText('nav button', 'Deployments');
    const prShown = await waitFor(() => js<boolean>(`document.querySelector('main')?.textContent.includes('#12') ?? false`), 6000);
    const prText = await js<string>(`[...document.querySelectorAll('main [role=link]')].map((e) => e.textContent).join(' | ')`);
    await shot('14-deploiements');
    criteria.push({ id: 'github-pr', ok: prShown && /#12\s*open/.test(prText) && prText.includes('2/3'), detail: prText || 'aucune PR affichée' });
    await clickText('nav button', 'Compare');
    await settle(2500);
    await shot('15-comparer');
    // Visual comparison: each environment rendered off screen like a device, differences in red.
    await clickText('[role=tab]', 'Visual');
    const visualOk = await waitFor(() => js<boolean>(`document.querySelectorAll('main figure img').length >= 3 && [...document.querySelectorAll('main figcaption')].slice(1).every((f) => /%|identical/.test(f.textContent))`), 30_000, 500);
    const visualText = await js<string>(`[...document.querySelectorAll('main figure')].map((f) => f.textContent).join(' | ')`);
    await shot('15b-comparer-visuel');
    criteria.push({ id: 'compare-visual', ok: visualOk && /LCP \d/.test(visualText), detail: visualText });
    await clickText('[role=tab]', 'Tags and checks');
    await clickText('nav button', 'Settings');
    await clickText('[aria-label="Settings pages"] button', 'Vercel');
    await sleep(800);
    await js(`document.querySelector('main')?.scrollTo(0, 99999)`);
    await settle(400);
    await shot('16-reglages-vercel');
    await clickText('nav button', 'Devices');
    await sleep(600);

    // ---- Phase 6 ----
    // 19. On my phone: a hidden Chromium window plays the phone (scans the QR code)
    type Phone = { running: boolean; port: number; address: string; clients: unknown[] };
    await devices.navigate('http://localhost:5173/');
    await sleep(1200);
    const phoneOn = (await js(`window.kinglet.phone.start()`)) as Phone;
    const qr = (await js(`window.kinglet.phone.qr('http://localhost:5173/', true)`)) as { url: string; svg: string };
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
      // Follow Kinglet's navigation
      await devices.navigate('http://localhost:5173/atelier.html');
      const followed = await waitFor(() => phoneWin.webContents.getURL().endsWith('/atelier.html'), 8000);
      // After a navigation the phone reconnects to the follow channel: wait for it.
      let state = (await js(`window.kinglet.phone.state()`)) as Phone;
      await waitFor(async () => (state = (await js(`window.kinglet.phone.state()`)) as Phone).clients.length >= 1, 5000);
      criteria.push({
        id: 'phone',
        ok: qr.svg.startsWith('<svg') && unpaired === 403 && loadedOnPhone && hmrOnPhone && followed && state.clients.length >= 1,
        detail: `${hmrOnPhone ? '' : `[console : ${phoneLog.slice(-3).join(' | ')}] `}${phoneOn.address}:${phoneOn.port} · non appairé ${unpaired} · page ${loadedOnPhone} · rechargement à chaud ${hmrOnPhone} · suit la navigation ${followed} · ${state.clients.length} appareil(s)`,
      });
      // Online pages: direct QR, with the bypass secret for a protected preview only
      const prodQr = (await js(`window.kinglet.phone.qr('http://127.0.0.1:5175/', false)`)) as { url: string; withSecret: boolean };
      const previewQr = (await js(`window.kinglet.phone.qr('http://127.0.0.1:5176/', false)`)) as { url: string; withSecret: boolean };
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
    await clickText('header button', 'On my phone');
    await settle(1500);
    await shot('17-telephone');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    const closed = await waitFor(async () => !(await js<boolean>(`!!document.querySelector('[aria-label="On my phone"][role=dialog]')`)) && devices.entries().every((d) => d.view.getVisible()), 3000);
    criteria.push({ id: 'phone-dialog', ok: closed, detail: closed ? 'fermé avec Échap, aperçus réaffichés' : 'toujours ouvert' });
    await js(`window.kinglet.phone.stop()`);

    // 20. Title bar fits at any window width (worst case: a preview with a long branch name)
    await clickText('nav button', 'Devices');
    await clickText('[aria-label=Environment] button', 'Preview');
    await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL().startsWith('http://127.0.0.1:5176')), 6000);
    await sleep(800);
    const fits: string[] = [];
    let allFit = true;
    for (const width of [1600, 1280, 960]) {
      win.setSize(width, 820);
      await sleep(700);
      const m = await js<{ overflow: number; wrapped: string[]; url: number }>(`(() => {
        const h = document.querySelector('[data-toolbar]');
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
    await clickText('[aria-label=Environment] button', 'Local');
    await sleep(1000);

    // ---- Phase 7 ----
    // 21. Updates: packaged app → finds 9.9.9 on the fake feed, downloads and verifies it (no install);
    //     dev build → updates disabled
    type Upd = { status: string; latest: string | null; kind: string };
    let upd = (await js(`window.kinglet.update.state()`)) as Upd;
    if (app.isPackaged) {
      await waitFor(async () => ['ready', 'error'].includes((upd = (await js(`window.kinglet.update.state()`)) as Upd).status), 30_000, 500);
      criteria.push({ id: 'update', ok: upd.status === 'ready' && upd.latest === '9.9.9', detail: `${upd.kind} : ${upd.status} ${upd.latest ?? ''} (téléchargée et vérifiée, non installée)` });
    } else {
      criteria.push({ id: 'update', ok: upd.status === 'unsupported', detail: `version de dev : mises à jour ${upd.status === 'unsupported' ? 'désactivées' : upd.status}` });
    }
    await clickText('nav button', 'Settings');
    await clickText('[aria-label="Settings pages"] button', 'Updates');
    await settle(800);
    await shot('19-mises-a-jour');
    await clickText('nav button', 'Devices');
    await sleep(500);

    // ---- Multi-projects ----
    // 22. A second project in a tab (address typed in the switcher), Ctrl 1 goes back to the first.
    ui({ type: 'shortcut', action: 'switcher' });
    const switcherShown = await waitFor(() => js<boolean>(`!!document.querySelector('[role=dialog][aria-label=Projects] input')`), 3000);
    await sleep(400);
    report['switcher'] = { shown: switcherShown, frozen: devices.entries().map((d) => d.view.getVisible()) };
    await shot('20-changer-de-projet');
    await js(`(() => {
      const el = document.querySelector('[role=dialog][aria-label=Projects] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '127.0.0.1:5175/atelier.html');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    await js(`document.querySelector('[role=dialog][aria-label=Projects] input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    const onSecond = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL() === 'http://127.0.0.1:5175/atelier.html'), 6000);
    const tabs = () => js<string[]>(`[...document.querySelectorAll('[aria-label="Open projects"] [role=tab]')].map((t) => t.textContent)`);
    const twoTabs = await tabs();
    ui({ type: 'shortcut', action: 'tab-1' });
    const backFirst = await waitFor(() => devices.entries().every((d) => d.view.webContents.getURL().startsWith('http://localhost:5173/')), 6000);
    criteria.push({ id: 'project-tabs', ok: onSecond && twoTabs.length === 2 && backFirst, detail: `onglets [${twoTabs.join(' | ')}] · 2e projet ${onSecond ? 'affiché' : 'absent'} · Ctrl 1 ${backFirst ? 'revient au 1er' : 'sans effet'}` });

    // 23. Claude Code hooks (in a temporary CLAUDE_CONFIG_DIR): a prompt in the project's folder
    //     marks its tab as working, Stop marks it done.
    const folder = join(outDir, 'projet-maison-sable');
    mkdirSync(folder, { recursive: true });
    const hooks = await js<{ installed: boolean; file: string }>(`window.kinglet.claude.install()`);
    const current = await js<{ projects: { id: string; folder: string | null }[]; activeId: string }>(`window.kinglet.updateSettings({})`);
    await js(`window.kinglet.updateSettings(${JSON.stringify({ projects: current.projects.map((p) => (p.id === current.activeId ? { ...p, folder } : p)) })})`);
    const script = join(app.getPath('userData'), 'claude-hook.sh');
    const fire = (payload: object) => execFileSync('sh', [script], { input: JSON.stringify(payload) });
    fire({ hook_event_name: 'UserPromptSubmit', session_id: 'selftest', cwd: join(folder, 'src'), prompt: 'Corrige le débordement sur iPhone' });
    fire({ hook_event_name: 'PostToolUse', session_id: 'selftest', cwd: folder, tool_name: 'Edit', tool_input: { file_path: join(folder, 'src/Hero.tsx') } });
    const working = await waitFor(() => js<boolean>(`!!document.querySelector('[aria-label="Open projects"] [aria-selected=true] .claude-dot')`), 3000);
    await settle(1200);
    await shot('21-claude-travaille');
    const thumb = await js<string | null>(`window.kinglet.thumbnail()`);
    if (thumb) writeFileSync(join(outDir, 'thumbnail.jpg'), Buffer.from(thumb.split(',')[1]!, 'base64'));
    fire({ hook_event_name: 'Stop', session_id: 'selftest', cwd: folder });
    type CS = { projects: Record<string, { status: string; files: string[] }> };
    const done = await waitFor(async () => (await js<CS>(`window.kinglet.claude.state()`)).projects[current.activeId]?.status === 'done', 3000);
    const cs = (await js<CS>(`window.kinglet.claude.state()`)).projects[current.activeId];
    criteria.push({
      id: 'claude-hooks',
      ok: hooks.installed && hooks.file.startsWith(outDir) && working && done && cs?.files[0] === 'src/Hero.tsx',
      detail: `hooks dans ${hooks.file.replace(outDir, '<selftest>')} · onglet ${working ? 'en cours (pastille)' : 'sans pastille'} · fin ${done ? 'reçue' : 'absente'} · fichiers ${cs?.files.join(', ')}`,
    });
    ui({ type: 'shortcut', action: 'overview' });
    await settle(900);
    await shot('22-tous-les-projets');
    const uninstalled = await js<{ installed: boolean }>(`window.kinglet.claude.uninstall()`);
    criteria.push({ id: 'claude-hooks-uninstall', ok: !uninstalled.installed && JSON.stringify(JSON.parse(readFileSync(hooks.file, 'utf8'))) === '{}', detail: 'hooks retirés, réglages de Claude Code laissés vides comme avant' });
    ui({ type: 'shortcut', action: 'overview' });
    await sleep(500);

    // ---- Devtools ----
    // 24. Favicon of the site kept on the project (its tab shows it).
    const cur = await js<{ projects: { id: string; favicon?: string | null }[]; activeId: string }>(`window.kinglet.updateSettings({})`);
    const fav = cur.projects.find((p) => p.id === cur.activeId)?.favicon ?? '';
    const tabImg = await js<boolean>(`!!document.querySelector('[aria-label="Open projects"] [aria-selected=true] img[src^="data:image/"]')`);
    criteria.push({ id: 'favicon', ok: fav.startsWith('data:image/') && tabImg, detail: `${fav.slice(0, 26)}… · ${tabImg ? 'shown in the tab' : 'not in the tab'}` });

    // 25. Console and network errors, live and per device (atelier.html calls an undefined function).
    await devices.navigate('http://localhost:5173/atelier.html');
    await waitFor(() => devices.entries().every((d) => !d.view.webContents.isLoading()), 8000);
    await sleep(800);
    await devices.entries()[0]!.view.webContents.executeJavaScript(`fetch('http://127.0.0.1:9/kinglet-missing.png').catch(() => {}); console.warn('kinglet selftest warning'); 1`);
    type L = { deviceId: string; source: string; level: string; status?: number; text: string };
    let logs: L[] = [];
    const gotLogs = await waitFor(async () => {
      logs = await js<L[]>(`window.kinglet.logs()`);
      return logs.some((l) => l.source === 'network' && l.text !== '' && JSON.stringify(l).includes('kinglet-missing')) && devices.entries().every((d) => logs.some((l) => l.deviceId === d.preset.id && l.source === 'console' && l.level === 'error'));
    }, 5000);
    const uiCount = await waitFor(async () => {
      // The console is a panel on the right of the devices, opened from the device bar.
      if (!(await js<boolean>(`!!document.querySelector('[aria-label="Console panel"]')`))) await clickText('main button[aria-pressed]', 'Console');
      return js<boolean>(`[...document.querySelectorAll('[aria-label=Console] li')].some((li) => li.textContent.includes('kinglet-missing.png'))`);
    }, 3000);
    await settle(500);
    await shot('23-console');
    const firstId = devices.entries()[0]!.preset.id;
    criteria.push({
      id: 'console',
      ok: gotLogs && uiCount && logs.some((l) => l.deviceId === firstId && l.level === 'warning' && l.text.includes('kinglet selftest')),
      detail: devices.entries().map((d) => `${d.preset.id}: ${logs.filter((l) => l.deviceId === d.preset.id && l.level === 'error').length} errors`).join(', ') + ` · failed request ${logs.some((l) => l.source === 'network' && JSON.stringify(l).includes('kinglet-missing')) ? 'seen' : 'missing'} · ${uiCount ? 'listed in the Console tab' : 'not in the tab'}`,
    });

    // 26. Slow 3G + mid-range phone CPU: one request and a fixed computation, timed in the phone
    //     before and after (a full page reload over slow 3G would take minutes on a Vite dev server).
    const probe = () =>
      devices.entries()[0]!.view.webContents.executeJavaScript(`(async () => {
        let t = performance.now();
        await fetch('/?kinglet-probe=' + Math.random(), { cache: 'no-store' });
        const net = Math.round(performance.now() - t);
        t = performance.now();
        let x = 0;
        for (let i = 0; i < 3e7; i++) x += i % 7;
        return { net, cpu: Math.round(performance.now() - t), x };
      })()`) as Promise<{ net: number; cpu: number }>;
    const fast = await probe();
    await js(`window.kinglet.updateSettings({ throttle: { network: '3g', cpu: 4 } })`);
    await sleep(600);
    const slow = await probe();
    await settle(300);
    await shot('24-3g-lente');
    await js(`window.kinglet.updateSettings({ throttle: { network: 'off', cpu: 1 } })`);
    await sleep(600);
    const back = await probe();
    criteria.push({
      id: 'throttle',
      ok: slow.net >= 1900 && slow.cpu > fast.cpu * 2.5 && back.net < 1000,
      detail: `request ${fast.net} → ${slow.net} ms, computation ${fast.cpu} → ${slow.cpu} ms (slow 3G, CPU ×4), back to ${back.net} ms`,
    });
    await clickText('nav button', 'Console'); // close the drawer

    // 26-media. Dark mode, reduced motion, high contrast: what the pages see in their media queries.
    await js(`window.kinglet.updateSettings({ media: { colorScheme: 'dark', reducedMotion: true, moreContrast: true } })`);
    const mq = `[matchMedia('(prefers-color-scheme: dark)').matches, matchMedia('(prefers-reduced-motion: reduce)').matches, matchMedia('(prefers-contrast: more)').matches]`;
    const mediaOn = await waitFor(async () => (await Promise.all(devices.entries().map((d) => d.view.webContents.executeJavaScript(mq) as Promise<boolean[]>))).every((r) => r.every(Boolean)), 3000);
    await settle(300);
    await shot('31-mode-sombre');
    await js(`window.kinglet.updateSettings({ media: { colorScheme: 'light', reducedMotion: false, moreContrast: false } })`);
    const mediaOff = await waitFor(async () => (await Promise.all(devices.entries().map((d) => d.view.webContents.executeJavaScript(mq) as Promise<boolean[]>))).every((r) => r.every((x) => !x)), 3000);
    await js(`window.kinglet.updateSettings({ media: { colorScheme: 'auto', reducedMotion: false, moreContrast: false } })`);
    criteria.push({ id: 'media', ok: mediaOn && mediaOff, detail: `sombre + animations réduites + contraste : ${mediaOn ? 'vus par les pages' : 'absents'} · clair : ${mediaOff ? 'ok' : 'échec'}` });

    // 26-network. Simulated API responses and offline mode, on every device.
    await js(`window.kinglet.updateSettings({ mocks: [{ id: 'm1', enabled: true, method: 'GET', pattern: '*/api/plans*', status: 503, contentType: 'application/json', body: '{"down":true}', delayMs: 300 }] })`);
    await sleep(600);
    const probeApi = `fetch('/api/plans?x=1').then(async (r) => r.status + ' ' + (await r.text())).catch((e) => 'failed ' + e.message)`;
    const mocked = (await Promise.all(devices.entries().map((d) => d.view.webContents.executeJavaScript(probeApi) as Promise<string>))) as string[];
    await clickText('main button[aria-haspopup=dialog]', 'Emulation'); // its button sums up "1 mock"
    await sleep(500);
    await shot('32b-emulation');
    await clickText('[role=dialog][aria-label=Emulation] button', 'Simulated API responses');
    await waitFor(() => js<boolean>(`!!document.querySelector('[role=dialog][aria-label="Simulated API responses"]')`), 3000);
    await settle(400);
    await shot('33-reponses-simulees');
    await js(`document.querySelector('[role=dialog][aria-label="Simulated API responses"] button[aria-label=Close]')?.click()`);
    await js(`window.kinglet.updateSettings({ mocks: [], offline: true })`);
    await sleep(600);
    const offline = (await Promise.all(devices.entries().map((d) => d.view.webContents.executeJavaScript(probeApi) as Promise<string>))) as string[];
    await js(`window.kinglet.updateSettings({ offline: false })`);
    await sleep(600);
    const online = (await devices.entries()[0]!.view.webContents.executeJavaScript(`fetch('/').then((r) => r.status).catch(() => 0)`)) as number;
    criteria.push({
      id: 'network-mocks',
      ok: mocked.every((m) => m === '503 {"down":true}') && offline.every((m) => m.startsWith('failed')) && online === 200,
      detail: `simulée : ${mocked.join(' / ')} · hors ligne : ${offline.join(' / ')} · retour : ${online}`,
    });

    // 26-inspect. Inspector: hover the title on one device, it is measured on all of them.
    await clickText('main button', 'Inspect');
    await waitFor(() => js<boolean>(`!!document.querySelector('[aria-label=Inspector]')`), 3000);
    await sleep(800);
    const inspected0 = devices.entries()[0]!;
    const r = (await inspected0.view.webContents.executeJavaScript(`(() => { const b = document.querySelector('h1').getBoundingClientRect(); return { x: b.left + 8, y: b.top + 8 }; })()`)) as { x: number; y: number };
    // Move in, twice: the first move can land before the view has its final size.
    for (const dx of [0, 4]) {
      inspected0.view.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round((r.x + dx) * inspected0.scale), y: Math.round(r.y * inspected0.scale) });
      await sleep(300);
    }
    const rows = await waitFor(() => js<boolean>(`[...document.querySelectorAll('[aria-label=Inspector] tbody tr')].length === ${devices.entries().length} && [...document.querySelectorAll('[aria-label=Inspector] tbody tr')].every((tr) => /[0-9]+ × [0-9]+/.test(tr.textContent))`), 5000);
    const inspectText = await js<string>(`document.querySelector('[aria-label=Inspector]')?.textContent ?? ''`);
    await shot('32-inspecteur');
    await js(`document.querySelector('[aria-label="Stop inspecting"]')?.click()`);
    const inspectOff = await waitFor(() => js<boolean>(`!document.querySelector('[aria-label=Inspector]')`), 3000);
    criteria.push({ id: 'inspector', ok: rows && inspectText.includes('h1') && inspectOff, detail: inspectText.slice(0, 160) });

    // 26-feedback. Review pins: pin a spot with a comment, open a GitHub issue with them.
    await clickText('nav button', 'Feedback');
    await clickText('aside[aria-label=Feedback] button', 'Pin a comment');
    await waitFor(() => js<boolean>(`!!document.querySelector('.cursor-crosshair')`), 4000);
    await js(`(() => {
      const el = document.querySelector('.cursor-crosshair');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.15 }));
    })()`);
    const pinAdded = await waitFor(() => js<boolean>(`!!document.querySelector('textarea[aria-label="Comment of pin 1"]')`), 5000);
    await js(`(() => {
      const ta = document.querySelector('textarea[aria-label="Comment of pin 1"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Le titre est trop gros sur téléphone');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await clickText('aside[aria-label=Feedback] button', 'Open an issue');
    const issued = await waitFor(() => js<boolean>(`document.querySelector('aside[aria-label=Feedback]')?.textContent.includes('Issue opened') ?? false`), 6000);
    await shot('34-retours');
    criteria.push({ id: 'feedback-pins', ok: pinAdded && issued, detail: `épingle ${pinAdded ? 'posée' : 'absente'} · issue ${issued ? 'ouverte (#7)' : 'non ouverte'}` });
    await clickText('nav button', 'Feedback');

    // 26a. Claude panel: a real terminal running Claude Code (a stand-in here) in the project folder,
    //      with Kinglet's MCP; "Show" puts the pointed spot (capture + element) in its input.
    await js(`(async () => {
      const s = await window.kinglet.updateSettings({});
      await window.kinglet.updateSettings({ projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, folder: ${JSON.stringify(process.env.KINGLET_DEMO_DIR ?? '/tmp')} } : p)) });
    })()`);
    const screen = () => js<string>(`[...document.querySelectorAll('aside[aria-label=Claude] .xterm-rows > div')].map((r) => r.textContent).join('\\n')`);
    // Open by default; unfold it if an earlier step folded it.
    if (!(await js<boolean>(`!!document.querySelector('aside[aria-label=Claude] [data-terminal]')`))) ui({ type: 'shortcut', action: 'claude' });
    let term = '';
    const started = await waitFor(async () => (term = await screen()).includes('FAKE-CLAUDE ready'), 8000);
    // Long lines wrap over several rows of the terminal: read them joined.
    const banner = /FAKE-CLAUDE ready[^>]*/.exec(term.replace(/\n/g, ''))?.[0] ?? '';
    await sleep(1000); // the devices settle at their new size next to the panel
    await clickText('aside[aria-label=Claude] button', 'Show');
    await waitFor(() => js<boolean>(`!!document.querySelector('.cursor-crosshair')`), 4000);
    await settle(400);
    await shot('28-claude-montrer');
    await js(`(() => {
      const el = document.querySelector('.cursor-crosshair');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + 30 }));
    })()`);
    const pointStart = Date.now();
    const pasted = await waitFor(async () => (term = await screen()).includes('PASTED'), 15000);
    const pointMs = Date.now() - pointStart;
    const pasteLine = /PASTED · [^·]+· [^·]+/.exec(term.replace(/\n/g, ''))?.[0] ?? '';
    // Typing goes to Claude, like in any terminal.
    const projectId = await js<string>(`window.kinglet.updateSettings({}).then((s) => s.activeId)`);
    await js(`window.kinglet.term.input(${JSON.stringify(projectId)}, 'make it smaller\\r')`);
    const typed = await waitFor(async () => (term = await screen()).includes('TYPED make it smaller'), 5000);
    await settle(300);
    await shot('29-claude-terminal');
    criteria.push({
      id: 'claude-terminal',
      ok: started && banner.includes('tty true') && banner.includes('mcp kinglet') && banner.includes(process.env.KINGLET_DEMO_DIR ?? '/tmp') && typed,
      detail: `${banner.replace(/\s+/g, ' ').trim() || 'pas démarré'} · frappe ${typed ? 'reçue' : 'perdue'}`,
    });
    criteria.push({
      id: 'claude-show',
      ok: pasted && pasteLine.includes('image yes') && pasteLine.includes('pointed yes') && pointMs < 5000,
      detail: `${pasteLine.replace(/\s+/g, ' ').trim() || 'rien collé'} · en ${pointMs} ms`,
    });
    await clickText('nav button', 'Claude'); // fold the column

    // 26b. Settings: a custom device is emulated like the built-in ones, then removed.
    await js(`window.kinglet.updateSettings({ customDevices: [{ id: 'custom-selftest', label: 'Fold', width: 673, height: 841, dpr: 2.625, kind: 'phone' }], active: ['iphone-16', 'ipad-air', 'custom-selftest'] })`);
    const customOn = await waitFor(() => devices.entries().some((d) => d.preset.id === 'custom-selftest' && d.preset.width === 673), 3000);
    await clickText('nav button', 'Settings');
    await clickText('[aria-label="Settings pages"] button', 'Devices');
    await settle(600);
    await shot('26-reglages-appareils');
    await clickText('[aria-label="Settings pages"] button', 'General');
    await settle(400);
    await shot('27-reglages-general');
    await js(`window.kinglet.updateSettings({ customDevices: [], active: ['iphone-16', 'ipad-air'] })`);
    const customOff = await waitFor(() => !devices.entries().some((d) => d.preset.id === 'custom-selftest'), 3000);
    criteria.push({ id: 'custom-device', ok: customOn && customOff, detail: `ajout ${customOn ? 'ok' : 'absent'} · retrait ${customOff ? 'ok' : 'échoué'}` });
    await clickText('nav button', 'Devices');

    // 27. Language: French, then back to English (default).
    await js(`window.kinglet.updateSettings({ language: 'fr' })`);
    const fr = await waitFor(() => js<boolean>(`document.documentElement.lang === 'fr' && !!document.querySelector('nav button[aria-label="Réglages"]')`), 3000);
    await clickText('nav button', 'Réglages');
    await settle(600);
    await shot('25-francais');
    await js(`window.kinglet.updateSettings({ language: 'en' })`);
    const en = await waitFor(() => js<boolean>(`document.documentElement.lang === 'en' && !!document.querySelector('nav button[aria-label="Settings"]')`), 3000);
    criteria.push({ id: 'language', ok: fr && en, detail: `français ${fr ? 'ok' : 'absent'} · back to English ${en ? 'ok' : 'failed'}` });
    await clickText('nav button', 'Devices');
    await sleep(500);

    // 28. Region, text size and zoom, on-screen keyboard, keyboard tour, accessibility, export, audit, history, review link.
    {
      const typeIn = async (text: string) => {
        for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
        await sleep(150);
      };
      const phone = () => devices.entries().find((d) => d.preset.id === 'iphone-16')!;
      const tablet = () => devices.entries().find((d) => d.preset.id === 'ipad-air')!;
      await js(`window.kinglet.navigate('http://localhost:5173/')`);
      await sleep(1500);
      await js(`window.kinglet.updateSettings({ region: { locale: 'ja-JP', timezone: 'Asia/Tokyo', geo: { latitude: 35.6762, longitude: 139.6503, label: 'Tokyo' } }, regionPerDevice: { 'ipad-air': { locale: 'de-DE', geo: null } } })`);
      await sleep(400);
      await js(`window.kinglet.reload()`);
      await sleep(1800);
      const probe = `(async () => ({ lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, num: new Intl.NumberFormat().format(1234.5), geo: await new Promise((r) => navigator.geolocation.getCurrentPosition((p) => r(p.coords.latitude.toFixed(2)), (e) => r('refused ' + e.code), { timeout: 4000 })) }))()`;
      const r1 = (await phone().view.webContents.executeJavaScript(probe)) as Record<string, string>;
      const r2 = (await tablet().view.webContents.executeJavaScript(probe)) as Record<string, string>;
      await shot('28-region');
      criteria.push({
        id: 'region',
        ok: r1.lang === 'ja-JP' && r1.tz === 'Asia/Tokyo' && r1.geo === '35.68' && r2.lang === 'de-DE' && r2.tz === 'Asia/Tokyo' && r2.geo!.startsWith('refused') && r2.num === '1.234,5',
        detail: `iphone-16 ${r1.lang} ${r1.tz} ${r1.num} geo ${r1.geo} · ipad-air ${r2.lang} ${r2.tz} ${r2.num} geo ${r2.geo}`,
      });
      await js(`window.kinglet.updateSettings({ region: { locale: null, timezone: null, geo: null }, regionPerDevice: {} })`);

      await js(`window.kinglet.updateSettings({ textSize: { scale: 2, zoom: 2 } })`);
      await sleep(900);
      const tz = (await phone().view.webContents.executeJavaScript(`[getComputedStyle(document.documentElement).fontSize, innerWidth]`)) as [string, number];
      const zoomed = await js<Report>(`window.kinglet.analyze('http://localhost:5173/')`);
      await shot('29-texte-zoom');
      const textZoom = zoomed.checks.find((c) => c.id === 'text-zoom');
      criteria.push({ id: 'text-size', ok: tz[0] === '32px' && Math.abs(tz[1] - 197) <= 1 && textZoom?.status !== 'skip', detail: `html ${tz[0]}, innerWidth ${tz[1]} · ${textZoom?.status}: ${textZoom?.detail}` });
      await js(`window.kinglet.updateSettings({ textSize: { scale: 1, zoom: 1 } })`);
      await sleep(600);

      await js(`window.kinglet.updateSettings({ keyboard: true })`);
      await sleep(600);
      const kb = (await phone().view.webContents.executeJavaScript(`(() => { const k = document.querySelector('[data-kinglet=keyboard]'); return k ? getComputedStyle(k).height : null; })()`)) as string | null;
      const kbTablet = (await tablet().view.webContents.executeJavaScript(`(() => { const k = document.querySelector('[data-kinglet=keyboard]'); return k ? getComputedStyle(k).height : null; })()`)) as string | null;
      await shot('30-clavier');
      await js(`window.kinglet.updateSettings({ keyboard: false })`);
      await sleep(300);
      const kbOff = (await phone().view.webContents.executeJavaScript(`!document.querySelector('[data-kinglet=keyboard]')`)) as boolean;
      criteria.push({ id: 'keyboard', ok: kb === '336px' && kbTablet === '320px' && kbOff, detail: `iphone-16 ${kb}, ipad-air ${kbTablet}, retiré ${kbOff}` });

      await js(`window.kinglet.setTabOrder(true)`);
      const tourOk = await waitFor(() => phone().view.webContents.executeJavaScript(`document.querySelectorAll('[data-kinglet=tab-order] > div').length > 0`) as Promise<boolean>, 5000);
      const badges = (await phone().view.webContents.executeJavaScript(`document.querySelectorAll('[data-kinglet=tab-order] > div').length / 2`)) as number;
      await shot('31-parcours-clavier');
      await js(`window.kinglet.setTabOrder(false)`);
      await sleep(300);
      criteria.push({ id: 'tab-order', ok: tourOk && badges > 0, detail: `${badges} éléments numérotés sur iPhone 16` });

      // The workshop page has a low-contrast, tiny link: axe must flag it.
      await js(`window.kinglet.navigate('http://localhost:5173/atelier.html')`);
      await sleep(1500);
      const a11yReport = await js<Report & { a11y?: { violations: { id: string; impact: string; nodes: number }[]; focus: { count: number; total: number } | null } }>(`window.kinglet.analyze('http://localhost:5173/atelier.html')`);
      await js(`window.kinglet.navigate('http://localhost:5173/')`);
      await sleep(1000);
      const st2 = Object.fromEntries(a11yReport.checks.map((c) => [c.id, c.status]));
      criteria.push({
        id: 'a11y',
        ok: !!a11yReport.a11y && st2['a11y-serious'] !== 'skip' && st2['focus-visible'] !== 'skip' && a11yReport.a11y.violations.some((v) => v.id === 'color-contrast'),
        detail: `${a11yReport.a11y?.violations.map((v) => `${v.id}(${v.impact}, ${v.nodes})`).join(' ')} · focus ${a11yReport.a11y?.focus?.count}/${a11yReport.a11y?.focus?.total} · ${st2['a11y-serious']}/${st2['a11y-minor']}/${st2['focus-visible']}`,
      });

      const shotsFull = await js<{ id: string; width: number; height: number; size: number }[]>(`window.kinglet.export.shots(true).then((s) => s.map((x) => ({ id: x.id, width: x.width, height: x.height, size: x.dataUrl.length })))`);
      const frames = await js<number>(`window.kinglet.export.frames().then((f) => Object.keys(f).length)`);
      criteria.push({ id: 'export', ok: shotsFull.length === 2 && shotsFull.every((x) => x.size > 10_000) && frames === 2, detail: `${shotsFull.map((x) => `${x.id} ${x.width}×${x.height}`).join(', ')} · ${frames} images vidéo` });

      // The menu itself: a sheet, a PDF, a GIF and a video, saved (no dialog in the acceptance run).
      const { readdirSync, statSync } = await import('node:fs');
      const exported: string[] = [];
      for (const [item, ext] of [['Sheet · screens', 'png'], ['PDF · one device per page', 'pdf'], ['GIF of the scroll', 'gif'], ['Video of the scroll', 'webm']] as const) {
        await clickText('button', 'Export');
        await sleep(400);
        await clickText('[role=menu] button', item);
        const ok = await waitFor(() => readdirSync(outDir).some((f) => f.startsWith('export-') && f.endsWith(`.${ext}`)), 30_000, 400);
        const file = readdirSync(outDir).find((f) => f.startsWith('export-') && f.endsWith(`.${ext}`));
        exported.push(ok && file ? `${ext} ${Math.round(statSync(join(outDir, file)).size / 1024)} Ko` : `${ext} absent`);
        await sleep(500);
      }
      criteria.push({ id: 'export-menu', ok: exported.every((x) => !x.includes('absent')), detail: exported.join(' · ') });
      await shot('31b-export');

      const audit = await js<{ pages: { path: string }[]; brokenLinks: unknown[]; duplicateTitles: unknown[] }>(`window.kinglet.audit('http://localhost:5173/', { limit: 20 })`);
      criteria.push({ id: 'site-audit', ok: audit.pages.length >= 2, detail: `${audit.pages.map((p) => p.path).join(', ')} · ${audit.brokenLinks.length} liens cassés · ${audit.duplicateTitles.length} titres en double` });
      ui({ type: 'shortcut', action: 'palette' });
      await sleep(300);
      await typeIn('Audit');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      await sleep(400);
      await js(`[...document.querySelectorAll('button')].find((b) => /Audit the site|Audit again/.test(b.textContent))?.click()`);
      await waitFor(() => js<boolean>(`!!document.querySelector('main') && /pages read/.test(document.querySelector('main').textContent)`), 15000);
      await settle(400);
      await shot('32-audit-site');
      await js(`[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('This page'))?.click()`);
      await settle(600);
      await shot('33-checks-page');
      await js(`(() => { const m = document.querySelector('[aria-label="Accessibility details"]')?.closest('main'); if (m) m.scrollTop = m.scrollHeight; })()`);
      await settle(300);
      await shot('33b-checks-a11y-budgets');

      const activeId = await js<string>(`window.kinglet.updateSettings({}).then((s) => s.activeId)`);
      const entry = await js<{ lcpMs: number | null; bytes: number | null; score: { passed: number; total: number } | null; error: string | null }>(`window.kinglet.history.measure(${JSON.stringify(activeId)}, { url: 'http://localhost:5173/', deploymentId: 'dpl_selftest', production: true, branch: 'main', commit: 'selftest' })`);
      const hist = await js<unknown[]>(`window.kinglet.history.load(${JSON.stringify(activeId)})`);
      criteria.push({ id: 'history', ok: entry.lcpMs != null && (entry.bytes ?? 0) > 0 && !!entry.score && hist.length > 0, detail: `LCP ${entry.lcpMs} ms · ${entry.bytes} o · ${entry.score?.passed}/${entry.score?.total} · ${hist.length} mesure(s) ${entry.error ?? ''}` });

      await clickText('nav button', 'Devices');
      await settle(600);
      const rv = await js<{ links: Record<string, string | null> }>(`window.kinglet.review.open(${JSON.stringify(activeId)})`);
      const link = rv.links[activeId];
      let reviewOk = false;
      let reviewDetail = 'pas de lien';
      if (link) {
        const local = link.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${new URL(link).port}`);
        const html = await (await fetch(local)).text();
        const data = (await (await fetch(`${local}/data`)).json()) as { shots: { id: string }[] };
        const post = await fetch(`${local}/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shotId: data.shots[0]?.id, fx: 0.5, fy: 0.3, text: 'Le bouton est trop petit', author: 'Alex' }) });
        await sleep(300);
        const pins = await js<{ comment: string; author?: string }[]>(`window.kinglet.feedback.load(${JSON.stringify(activeId)})`);
        const got = pins.find((p) => p.comment === 'Le bouton est trop petit');
        const bad = await fetch(local.replace(/\/r\/[^/]+/, '/r/mauvais-jeton-de-vingt-caracteres'));
        reviewOk = html.includes('<script>') && data.shots.length === 2 && post.ok && got?.author === 'Alex' && bad.status === 404;
        reviewDetail = `${link} · ${data.shots.length} captures · retour du client ${got ? `de ${got.author}` : 'absent'} · jeton faux ${bad.status}`;
        await clickText('nav button', 'Feedback');
        await settle(800);
        await shot('34-lien-relecture');
        await clickText('nav button', 'Feedback');
        await js(`window.kinglet.feedback.save(${JSON.stringify(activeId)}, ${JSON.stringify([])})`);
        await js(`window.kinglet.review.close(${JSON.stringify(activeId)})`);
      }
      criteria.push({ id: 'review-link', ok: reviewOk, detail: reviewDetail });

      // 29. Forms, on-screen keyboard seen by the page, dead anchors after JavaScript, local history.
      const contact = 'http://localhost:5173/contact.html';
      await js(`window.kinglet.navigate(${JSON.stringify(contact)})`);
      await sleep(1500);
      const inPage = <T,>(code: string) => phone().view.webContents.executeJavaScript(code) as Promise<T>;
      const formsReport = await js<Report>(`window.kinglet.analyze(${JSON.stringify(contact)})`);
      const formsCheck = formsReport.checks.find((c) => c.id === 'forms');
      const bad = await js<Record<string, { filled: number; accepted: string[]; refused: string[] }>>(`window.kinglet.fillForms('invalid')`);
      const good = await js<Record<string, { filled: number; accepted: string[]; refused: string[] }>>(`window.kinglet.fillForms('valid')`);
      const seen = await inPage<[string, number, boolean]>(`[document.getElementById('email').value, window.kinglet_inputs, document.querySelector('[name=rgpd]').checked]`);
      criteria.push({
        id: 'forms',
        ok:
          formsCheck?.status === 'warning' &&
          /E-mail/.test(formsCheck.detail) &&
          bad['iphone-16']!.accepted.includes('E-mail') &&
          bad['iphone-16']!.refused.some((r) => r.startsWith('Code postal')) &&
          good['iphone-16']!.refused.length === 0 &&
          seen[0] === 'camille.martin@example.com' &&
          seen[1] > 0 &&
          seen[2],
        detail: `${formsCheck?.status}: ${formsCheck?.detail} · faux acceptés : ${bad['iphone-16']?.accepted.join(', ')} · refusés : ${bad['iphone-16']?.refused.join(', ')} · valide : ${good['iphone-16']?.filled} champs, ${good['iphone-16']?.refused.length} refusés · page : ${seen[0]}, ${seen[1]} événements input`,
      });
      await clickText('button', 'Forms');
      await sleep(400);
      await clickText('[role=menu] button', 'wrong data');
      await settle(800);
      await shot('35-formulaires');

      await js(`window.kinglet.updateSettings({ keyboard: true })`);
      await sleep(700);
      const vvOn = await inPage<[number, number, number]>(`[visualViewport.height, innerHeight, window.kinglet_vv]`);
      await js(`window.kinglet.updateSettings({ keyboard: false })`);
      await sleep(500);
      const vvOff = await inPage<[number, number, number]>(`[visualViewport.height, innerHeight, window.kinglet_vv]`);
      criteria.push({
        id: 'keyboard-viewport',
        ok: Math.abs(vvOn[1] - vvOn[0] - 336) <= 1 && vvOn[2] >= 1 && Math.abs(vvOff[0] - vvOff[1]) <= 1 && vvOff[2] > vvOn[2],
        detail: `clavier ouvert : visualViewport ${vvOn[0]} / innerHeight ${vvOn[1]} · fermé : ${vvOff[0]} / ${vvOff[1]} · ${vvOff[2]} événements resize`,
      });

      const audit2 = await js<{ brokenLinks: { kind: string; path: string }[]; anchorsRendered?: boolean }>(`window.kinglet.audit(${JSON.stringify(contact)}, { limit: 20 })`);
      const dead = audit2.brokenLinks.filter((b) => b.kind === 'anchor').map((b) => b.path);
      criteria.push({ id: 'anchors-rendered', ok: audit2.anchorsRendered === true && dead.includes('/contact.html#nulle-part') && !dead.includes('/contact.html#avis'), detail: `ancres mortes après JavaScript : ${dead.join(', ') || 'aucune'}` });

      const hist2 = await js<{ source?: string; url: string }[]>(`window.kinglet.history.load(${JSON.stringify(activeId)})`);
      criteria.push({ id: 'history-local', ok: hist2.some((e) => e.source === 'claude'), detail: hist2.map((e) => `${e.source ?? '?'} ${new URL(e.url).pathname}`).join(' · ') });
      await js(`window.kinglet.navigate('http://localhost:5173/')`);
      await sleep(800);
      await clickText('nav button', 'Devices');
      await sleep(400);
    }

    // 10. Partage section
    ui({ type: 'shortcut', action: 'focus-url' });
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes('Open Graph'))?.click()`);
    await settle(1200);
    await shot('08-section-partage');
  } catch (e) {
    report['error'] = (e as Error).stack;
  }

  report['criteria'] = criteria;
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write('SELFTEST:DONE\n');
  app.quit();
}
