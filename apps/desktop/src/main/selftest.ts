import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import { checkShare, probeImage, readPageMeta } from '@parakeet/core';
import type { DeviceManager } from './devices';

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
  } catch (e) {
    report['error'] = (e as Error).stack;
  }

  report['criteria'] = criteria;
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write('SELFTEST:DONE\n');
  app.quit();
}
