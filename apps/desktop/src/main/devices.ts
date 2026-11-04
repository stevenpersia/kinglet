import { join } from 'node:path';
import { BaseWindow, WebContentsView, ipcMain, session, type Input, type Session } from 'electron';
import { HEAVY_IMAGE_BYTES, type RenderedDevice } from '@parakeet/core';
import type { DevicePreset, DeviceSlot, PreviewEvent, ShortcutAction } from '../shared/types';

export const PREVIEW_PARTITION = 'persist:parakeet-preview';

interface DeviceEntry {
  preset: DevicePreset;
  view: WebContentsView;
  scale: number;
  attached: boolean;
  /** Until when navigation events from this device are ignored (it is following another one). */
  followingUntil: number;
  /** console.error and uncaught errors since the last page load. */
  consoleErrors: string[];
}

/** Runs inside a device page: what only the rendered page (after JavaScript) can tell. */
const MEASURE = `(() => {
  const heavy = performance.getEntriesByType('resource')
    .filter((e) => e.initiatorType === 'img' || /\\.(png|jpe?g|webp|gif|avif)(\\?|$)/i.test(e.name))
    .map((e) => ({ url: e.name, bytes: e.transferSize || e.encodedBodySize || 0 }))
    .filter((i) => i.bytes > ${HEAVY_IMAGE_BYTES});
  return {
    // Mobile browsers zoom out to fit a too-wide page (innerWidth grows with it): compare with the screen.
    overflowPx: Math.max(0, Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - screen.width),
    heavyImages: heavy,
    links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
  };
})()`;

const errorPage = (url: string, error: string) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><meta name="viewport" content="width=device-width">
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111113;color:#A1A1AA;font:15px system-ui;text-align:center;padding:24px;box-sizing:border-box">
<div><div style="color:#EDEDEF;font-weight:600;margin-bottom:8px">Rien à afficher</div>
<div style="font-family:monospace;font-size:13px;margin-bottom:12px">${url.replace(/</g, '&lt;')}</div>
<div>${error.replace(/</g, '&lt;')}</div></div></body>`);

/** Shortcuts that must work even when the focus is inside a device page. */
export function shortcutFor(input: Pick<Input, 'type' | 'key' | 'control' | 'meta' | 'shift' | 'alt'>): ShortcutAction | null {
  if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  const key = input.key.toLowerCase();
  if (key === 'r' && !input.shift) return 'reload';
  if (key === 'l' && !input.shift) return 'focus-url';
  if (key === 'k' && !input.shift) return 'palette';
  if (key === ',' && !input.shift) return 'settings';
  if (key === 'o' && input.shift) return 'toggle-landscape';
  if (key === 's' && input.shift) return 'toggle-scroll-sync';
  return null;
}

/**
 * One WebContentsView per emulated device, laid over the slots drawn by the UI.
 * Emulation goes through the Chrome DevTools Protocol (the same engine as Chrome's device mode).
 */
export class DeviceManager {
  private devices = new Map<string, DeviceEntry>();
  private url: string | null = null;
  private scrollSync = true;
  private landscape = false;
  private visible = true;
  private frozen = false;
  readonly session: Session = session.fromPartition(PREVIEW_PARTITION);

  constructor(
    private window: BaseWindow,
    private presets: DevicePreset[],
    private emit: (e: PreviewEvent) => void,
  ) {
    ipcMain.on('device:scroll', (event, ratio: number) => {
      if (process.env.PARAKEET_DEBUG) console.log(`[scroll] from ${event.sender.id} ratio ${ratio}`);
      if (!this.scrollSync) return;
      for (const d of this.devices.values()) {
        if (d.view.webContents.id !== event.sender.id) d.view.webContents.send('device:scroll-to', ratio);
      }
    });
  }

  get currentUrl() {
    return this.url;
  }

  entries() {
    return [...this.devices.values()];
  }

  private isPrimary(id: string) {
    return [...this.devices.keys()][0] === id;
  }

  setScrollSync(on: boolean) {
    this.scrollSync = on;
  }

  setLandscape(on: boolean) {
    if (on === this.landscape) return;
    this.landscape = on;
    for (const d of this.devices.values()) void this.emulate(d);
  }

  setActive(ids: string[]) {
    for (const [id, d] of this.devices) {
      if (!ids.includes(id)) {
        if (d.attached) this.window.contentView.removeChildView(d.view);
        d.view.webContents.close();
        this.devices.delete(id);
      }
    }
    // Keep the UI order (it decides which device is "primary").
    const ordered = new Map<string, DeviceEntry>();
    for (const id of ids) {
      const existing = this.devices.get(id);
      if (existing) ordered.set(id, existing);
      else {
        const preset = this.presets.find((p) => p.id === id);
        if (preset) ordered.set(id, this.create(preset));
      }
    }
    this.devices = ordered;
  }

  private create(preset: DevicePreset): DeviceEntry {
    const view = new WebContentsView({
      webPreferences: {
        partition: PREVIEW_PARTITION,
        preload: join(__dirname, '../preload/device.js'),
        sandbox: true,
        contextIsolation: true,
      },
    });
    view.setBackgroundColor('#111113');
    view.setVisible(this.visible && !this.frozen);
    const entry: DeviceEntry = { preset, view, scale: 0.5, attached: false, followingUntil: 0, consoleErrors: [] };

    const wc = view.webContents;
    if (preset.userAgent) wc.setUserAgent(preset.userAgent);
    try {
      wc.debugger.attach('1.3');
    } catch (e) {
      console.error(`[${preset.id}] debugger attach failed`, e);
    }
    void this.emulate(entry);

    wc.on('before-input-event', (event, input) => {
      const action = shortcutFor(input);
      if (action) {
        event.preventDefault();
        this.emit({ type: 'shortcut', action });
      }
    });
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) entry.consoleErrors = [];
    });
    wc.on('console-message', (e) => {
      const { level, message } = e as unknown as { level: string; message: string };
      if (level === 'error' && entry.consoleErrors.length < 50) entry.consoleErrors.push(message);
    });
    wc.on('did-start-loading', () => {
      if (this.isPrimary(preset.id) && this.url) this.emit({ type: 'loading', url: this.url });
    });
    wc.on('did-finish-load', () => {
      if (wc.getURL().startsWith('data:')) return;
      if (this.isPrimary(preset.id)) this.emit({ type: 'loaded', url: wc.getURL() });
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      const hint = code === -102 ? 'Aucun serveur ne répond. Lance ton serveur de dev (pnpm dev).' : `${desc} (${code})`;
      void wc.loadURL(errorPage(url, hint));
      if (this.isPrimary(preset.id)) this.emit({ type: 'failed', url, error: hint });
    });
    // Navigation sync: a link clicked (or a client-side route change) in one device is followed by the others.
    wc.on('will-navigate', (e) => this.follow(entry, e.url));
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.follow(entry, url);
      if (this.isPrimary(preset.id)) this.emit({ type: 'navigated', url });
    });
    wc.on('did-navigate', (_e, url) => {
      if (url.startsWith('data:')) return;
      if (this.isPrimary(preset.id)) {
        this.url = url;
        this.emit({ type: 'navigated', url });
      }
    });
    // Links that open a new window stay inside the device.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url);
      return { action: 'deny' };
    });

    if (this.url) void wc.loadURL(this.url);
    return entry;
  }

  private follow(source: DeviceEntry, url: string) {
    if (!this.scrollSync || Date.now() < source.followingUntil || !/^https?:/.test(url)) return;
    for (const d of this.devices.values()) {
      if (d === source || d.view.webContents.getURL() === url) continue;
      d.followingUntil = Date.now() + 2000;
      void d.view.webContents.loadURL(url).catch(() => undefined);
    }
  }

  /** CSS viewport of a device in the current orientation. */
  viewport(preset: DevicePreset) {
    return this.landscape && preset.kind !== 'desktop' ? { width: preset.height, height: preset.width } : { width: preset.width, height: preset.height };
  }

  private async emulate(d: DeviceEntry) {
    const { preset, scale } = d;
    const dbg = d.view.webContents.debugger;
    if (!dbg.isAttached()) return;
    const send = (method: string, params: object) =>
      dbg.sendCommand(method, params).catch((e: Error) => console.error(`[${preset.id}] ${method}`, e.message));
    const { width, height } = this.viewport(preset);
    const landscape = width > height && preset.kind !== 'desktop';
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: preset.dpr,
      mobile: preset.mobile,
      scale,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: preset.touch, maxTouchPoints: preset.touch ? 5 : 1 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: preset.touch, configuration: preset.touch ? 'mobile' : 'desktop' });
    if (preset.userAgent) {
      const platform = preset.userAgent.includes('Android') ? 'Linux armv81' : preset.userAgent.includes('iPhone') ? 'iPhone' : 'MacIntel';
      await send('Emulation.setUserAgentOverride', { userAgent: preset.userAgent, platform });
    }
  }

  setLayout(slots: DeviceSlot[]) {
    for (const slot of slots) {
      const d = this.devices.get(slot.id);
      if (!d) continue;
      d.view.setBounds({ x: Math.round(slot.x), y: Math.round(slot.y), width: Math.round(slot.width), height: Math.round(slot.height) });
      d.view.setBorderRadius(Math.round(d.preset.radius * slot.scale));
      if (!d.attached) {
        this.window.contentView.addChildView(d.view);
        d.attached = true;
      }
      if (Math.abs(d.scale - slot.scale) > 0.001) {
        d.scale = slot.scale;
        void this.emulate(d);
      }
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const d of this.devices.values()) d.view.setVisible(visible && !this.frozen);
  }

  async freeze(): Promise<Record<string, string>> {
    const shots: Record<string, string> = {};
    await Promise.all(
      this.entries().map(async (d) => {
        if (!this.visible) return;
        // capturePage() ignores the emulated viewport; the DevTools capture matches what the device shows.
        try {
          const dbg = d.view.webContents.debugger;
          const { cssVisualViewport: vv } = (await dbg.sendCommand('Page.getLayoutMetrics')) as {
            cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
          };
          const { data } = (await dbg.sendCommand('Page.captureScreenshot', {
            format: 'jpeg',
            quality: 80,
            clip: { x: vv.pageX, y: vv.pageY, width: vv.clientWidth, height: vv.clientHeight, scale: 1 },
          })) as { data: string };
          shots[d.preset.id] = `data:image/jpeg;base64,${data}`;
        } catch {
          try {
            shots[d.preset.id] = (await d.view.webContents.capturePage()).toDataURL();
          } catch {
            /* view not painted yet */
          }
        }
      }),
    );
    this.frozen = true;
    for (const d of this.devices.values()) d.view.setVisible(false);
    return shots;
  }

  unfreeze() {
    this.frozen = false;
    for (const d of this.devices.values()) d.view.setVisible(this.visible);
  }

  /** Rendered-page measures of every device, plus the links found in the first one. */
  async measure(): Promise<{ devices: RenderedDevice[]; links: string[] }> {
    const results = await Promise.all(
      this.entries().map(async (d) => {
        const url = d.view.webContents.getURL();
        if (!/^https?:/.test(url)) return null;
        try {
          const m = (await d.view.webContents.executeJavaScript(MEASURE)) as { overflowPx: number; heavyImages: { url: string; bytes: number }[]; links: string[] };
          return { device: { id: d.preset.id, label: d.preset.label, overflowPx: m.overflowPx, heavyImages: m.heavyImages, consoleErrors: [...d.consoleErrors] }, links: m.links };
        } catch {
          return null;
        }
      }),
    );
    const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
    return { devices: ok.map((r) => r.device), links: ok[0]?.links ?? [] };
  }

  openDevtools(id: string) {
    this.devices.get(id)?.view.webContents.openDevTools({ mode: 'detach', title: `Parakeet — ${id}` });
  }

  async navigate(url: string) {
    this.url = url;
    const until = Date.now() + 2000;
    await Promise.all(
      this.entries().map((d) => {
        d.followingUntil = until;
        return d.view.webContents.loadURL(url).catch(() => undefined);
      }),
    );
  }

  reload() {
    for (const d of this.devices.values()) {
      if (d.view.webContents.getURL().startsWith('data:') && this.url) void d.view.webContents.loadURL(this.url);
      else d.view.webContents.reloadIgnoringCache();
    }
  }
}
