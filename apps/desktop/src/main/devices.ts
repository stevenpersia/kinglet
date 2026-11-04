import { join } from 'node:path';
import { BaseWindow, WebContentsView, ipcMain, screen, session, type Input, type Session } from 'electron';
import { HEAVY_IMAGE_BYTES, getLanguage, t, type RenderedDevice } from '@parakeet/core';
import type { DeviceLog, DevicePreset, DeviceSlot, ElementInfo, PreviewEvent, ShortcutAction, Throttle } from '../shared/types';

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
  /**
   * Emulation changes and captures run one at a time: a capture with a clip scale overrides
   * the device metrics for a moment, and a resize landing in between left the view zoomed.
   */
  queue?: Promise<unknown>;
  /** Console and network log since the last page load. */
  logs: DeviceLog[];
  /** Requests in flight (CDP Network), to name the URL of a failed one. */
  requests: Map<string, { url: string; method: string; type: string }>;
}

const MAX_LOGS = 400;

/**
 * Chrome DevTools' presets. "4g" is Lighthouse's mobile profile (slow 4G); "3g" is DevTools'
 * "Slow 3G". Throughputs in bytes per second, latency in ms.
 */
export const NETWORK_PROFILES = {
  '4g': { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  '3g': { latency: 2000, downloadThroughput: (500 * 1024 * 0.8) / 8, uploadThroughput: (500 * 1024 * 0.8) / 8 },
} as const;

/** console-message levels (Electron) → ours. */
const LEVEL: Record<string, DeviceLog['level']> = { error: 'error', warning: 'warning', info: 'info', debug: 'debug', log: 'info' };

/** Runs in a device page after load: navigation timing and what was transferred. */
const PERF = `(() => {
  const n = performance.getEntriesByType('navigation')[0];
  if (!n) return null;
  const res = performance.getEntriesByType('resource');
  const bytes = (n.transferSize || n.encodedBodySize || 0) + res.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0);
  return { loadMs: Math.round(n.loadEventEnd || n.domComplete || performance.now()), domMs: Math.round(n.domContentLoadedEventEnd), bytes, requests: res.length + 1 };
})()`;

const serial = <T,>(d: DeviceEntry, job: () => Promise<T>): Promise<T> => {
  const run = (d.queue ?? Promise.resolve()).then(job, job);
  d.queue = run.catch(() => undefined);
  return run;
};

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
  encodeURIComponent(`<!doctype html><html lang="${getLanguage()}"><meta name="viewport" content="width=device-width">
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111113;color:#A1A1AA;font:15px system-ui;text-align:center;padding:24px;box-sizing:border-box">
<div><div style="color:#EDEDEF;font-weight:600;margin-bottom:8px">${t('Nothing to show', 'Rien à afficher')}</div>
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
  if (key === 'p' && !input.shift) return 'switcher';
  if (key === 'a' && input.shift) return 'overview';
  if (key === 'j' && !input.shift) return 'claude';
  if (/^[1-9]$/.test(key) && !input.shift) return `tab-${Number(key)}`;
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
  private throttle: Throttle = { network: 'off', cpu: 1 };
  private logSeq = 0;
  private pendingLogs: DeviceLog[] = [];
  private clearedLogs = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
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

  /** The element under a point (CSS px of the device viewport): what "Show Claude" points at. */
  async elementAt(id: string, x: number, y: number): Promise<ElementInfo | null> {
    const d = this.devices.get(id);
    if (!d) return null;
    const code = `(() => {
      const el = document.elementFromPoint(${Number(x)}, ${Number(y)});
      if (!el) return null;
      const part = (e) => {
        if (e.id) return '#' + CSS.escape(e.id);
        const cls = [...e.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join('');
        const parent = e.parentElement;
        const same = parent ? [...parent.children].filter((c) => c.tagName === e.tagName) : [];
        return e.tagName.toLowerCase() + cls + (same.length > 1 ? ':nth-of-type(' + (same.indexOf(e) + 1) + ')' : '');
      };
      const path = [];
      for (let e = el; e && e !== document.body && path.length < 5; e = e.parentElement) { path.unshift(part(e)); if (e.id) break; }
      const r = el.getBoundingClientRect();
      return { selector: path.join(' > '), tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 200), html: el.outerHTML.slice(0, 600), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    })()`;
    try {
      return (await d.view.webContents.executeJavaScript(code)) as ElementInfo | null;
    } catch {
      return null;
    }
  }

  /** Built-in and custom devices (custom ones can be added in the settings). */
  setPresets(presets: DevicePreset[]) {
    this.presets = presets;
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
    const entry: DeviceEntry = { preset, view, scale: 0.5, attached: false, followingUntil: 0, consoleErrors: [], logs: [], requests: new Map() };

    const wc = view.webContents;
    if (preset.userAgent) wc.setUserAgent(preset.userAgent);
    try {
      wc.debugger.attach('1.3');
    } catch (e) {
      console.error(`[${preset.id}] debugger attach failed`, e);
    }
    void this.emulate(entry);
    this.watchNetwork(entry);

    wc.on('before-input-event', (event, input) => {
      const action = shortcutFor(input);
      if (action) {
        event.preventDefault();
        this.emit({ type: 'shortcut', action });
      }
    });
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        entry.consoleErrors = [];
        entry.logs = [];
        entry.requests.clear();
        this.clearedLogs.add(preset.id);
        this.pendingLogs = this.pendingLogs.filter((l) => l.deviceId !== preset.id);
        this.scheduleFlush();
      }
    });
    wc.on('console-message', (e) => {
      const { level, message, lineNumber, sourceId } = e as unknown as { level: string; message: string; lineNumber: number; sourceId: string };
      if (level === 'error' && entry.consoleErrors.length < 50) entry.consoleErrors.push(message);
      // Parakeet's own preload scripts.
      if (sourceId?.startsWith('node:') || /preload/.test(sourceId ?? '')) return;
      this.log(entry, { source: 'console', level: LEVEL[level] ?? 'info', text: message, url: sourceId || undefined, line: lineNumber || undefined });
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      if (this.isPrimary(preset.id) && favicons[0]) this.emit({ type: 'favicon', url: favicons[0], pageUrl: wc.getURL() });
    });
    wc.on('did-start-loading', () => {
      if (this.isPrimary(preset.id) && this.url) this.emit({ type: 'loading', url: this.url });
    });
    wc.on('did-finish-load', () => {
      if (wc.getURL().startsWith('data:')) return;
      if (this.isPrimary(preset.id)) this.emit({ type: 'loaded', url: wc.getURL() });
      // loadEventEnd is set once the load handlers have run.
      setTimeout(async () => {
        if (wc.isDestroyed()) return;
        const perf = (await wc.executeJavaScript(PERF).catch(() => null)) as Omit<import('../shared/types').DevicePerf, 'deviceId' | 'url'> | null;
        if (perf) this.emit({ type: 'perf', perf: { ...perf, deviceId: preset.id, url: wc.getURL() } });
      }, 60);
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      const hint = code === -102 ? t('No server is responding. Start your dev server (pnpm dev).', 'Aucun serveur ne répond. Lance ton serveur de dev (pnpm dev).') : `${desc} (${code})`;
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

  /** Failed requests and HTTP errors, from the DevTools protocol. */
  private watchNetwork(entry: DeviceEntry) {
    const dbg = entry.view.webContents.debugger;
    if (!dbg.isAttached()) return;
    void dbg.sendCommand('Network.enable').then(() => this.applyThrottle(entry)).catch(() => undefined);
    dbg.on('message', (_e, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        if (entry.requests.size > 2000) entry.requests.clear();
        entry.requests.set(params.requestId, { url: params.request.url, method: params.request.method, type: params.type ?? '' });
      } else if (method === 'Network.responseReceived') {
        const r = params.response as { status: number; statusText: string; url: string };
        if (r.status >= 400) {
          const req = entry.requests.get(params.requestId);
          this.log(entry, { source: 'network', level: r.status >= 500 || params.type === 'Document' ? 'error' : 'warning', text: `${r.status} ${r.statusText || ''}`.trim(), url: r.url, status: r.status, method: req?.method, resourceType: params.type });
        }
      } else if (method === 'Network.loadingFailed') {
        const req = entry.requests.get(params.requestId);
        entry.requests.delete(params.requestId);
        // Aborted by navigation, or the dev server's hot-reload socket closing: not errors.
        if (params.canceled || !req || params.type === 'WebSocket' || params.type === 'EventSource') return;
        this.log(entry, { source: 'network', level: 'error', text: params.blockedReason ? t(`blocked (${params.blockedReason})`, `bloqué (${params.blockedReason})`) : String(params.errorText), url: req.url, status: 0, method: req.method, resourceType: params.type });
      } else if (method === 'Network.loadingFinished') {
        entry.requests.delete(params.requestId);
      }
    });
  }

  private log(entry: DeviceEntry, l: Omit<DeviceLog, 'id' | 'at' | 'deviceId'>) {
    const full: DeviceLog = { ...l, text: l.text.length > 4000 ? `${l.text.slice(0, 4000)}…` : l.text, id: ++this.logSeq, at: Date.now(), deviceId: entry.preset.id };
    entry.logs.push(full);
    if (entry.logs.length > MAX_LOGS) entry.logs.splice(0, entry.logs.length - MAX_LOGS);
    this.pendingLogs.push(full);
    this.scheduleFlush();
  }

  /** Logs go to the UI in batches (a page can log hundreds of lines in a loop). */
  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const entries = this.pendingLogs.slice(-MAX_LOGS);
      const cleared = [...this.clearedLogs];
      this.pendingLogs = [];
      this.clearedLogs.clear();
      if (entries.length || cleared.length) this.emit({ type: 'logs', entries, cleared });
    }, 200);
  }

  /** Every device's log (for the UI at startup and for Claude). */
  allLogs(): DeviceLog[] {
    return this.entries()
      .flatMap((d) => d.logs)
      .sort((a, b) => a.id - b.id);
  }

  setThrottle(t: Throttle) {
    this.throttle = t;
    for (const d of this.devices.values()) void this.applyThrottle(d);
  }

  get throttling() {
    return this.throttle;
  }

  /** Slow network and CPU on phones and tablets: a site feels much slower there than on a PC. */
  private applyThrottle(d: DeviceEntry) {
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      if (!dbg.isAttached()) return;
      const on = d.preset.kind !== 'desktop';
      const net = on && this.throttle.network !== 'off' ? NETWORK_PROFILES[this.throttle.network] : null;
      await dbg
        .sendCommand('Network.emulateNetworkConditions', net ? { offline: false, ...net } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
        .catch((e: Error) => console.error(`[${d.preset.id}] throttle network`, e.message));
      await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: on ? this.throttle.cpu : 1 }).catch((e: Error) => console.error(`[${d.preset.id}] throttle cpu`, e.message));
    });
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

  private emulate(d: DeviceEntry) {
    return serial(d, () => this.emulateNow(d));
  }

  private async emulateNow(d: DeviceEntry) {
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

  /**
   * JPEG of what a device shows (base64). capturePage() ignores the emulated viewport;
   * the DevTools capture matches the device. `scale` 1 = device pixels (dpr × CSS px).
   */
  async capture(id: string, scale = 1): Promise<string | null> {
    const d = this.devices.get(id);
    if (!d) return null;
    return serial(d, () => this.captureNow(d, scale));
  }

  private async captureNow(d: DeviceEntry, scale: number): Promise<string | null> {
    try {
      const dbg = d.view.webContents.debugger;
      const { cssVisualViewport: vv } = (await dbg.sendCommand('Page.getLayoutMetrics')) as {
        cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
      };
      const { data } = (await dbg.sendCommand('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 80,
        clip: { x: vv.pageX, y: vv.pageY, width: vv.clientWidth, height: vv.clientHeight, scale },
      })) as { data: string };
      return data;
    } catch {
      try {
        return (await d.view.webContents.capturePage()).toJPEG(80).toString('base64');
      } catch {
        return null; // view not painted yet
      }
    }
  }

  /**
   * What a view shows on screen, as a data URL. Unlike a DevTools capture (which re-renders the
   * page at the requested scale and makes the live view flash zoomed), this changes nothing.
   */
  private async displayed(d: DeviceEntry, quality = 85): Promise<string | null> {
    try {
      const full = await d.view.webContents.capturePage();
      if (full.isEmpty()) return null;
      // With the emulation scale, the page is sometimes painted in the top-left `scale` part of a
      // larger surface, sometimes right at the view's size (after a resize): crop only in the first case.
      const { width, height } = full.getSize();
      const sf = screen.getDisplayMatching(this.window.getBounds()).scaleFactor;
      const larger = width > d.view.getBounds().width * sf * 1.2;
      const img = d.scale < 0.999 && larger ? full.crop({ x: 0, y: 0, width: Math.max(1, Math.round(width * d.scale)), height: Math.max(1, Math.round(height * d.scale)) }) : full;
      return img.isEmpty() ? null : `data:image/jpeg;base64,${img.toJPEG(quality).toString('base64')}`;
    } catch {
      return null; // not painted yet
    }
  }

  /** Small capture of the first phone (else the first device), for the projects overview. */
  async thumbnail(): Promise<string | null> {
    const list = this.entries();
    const d = list.find((x) => x.preset.kind === 'phone') ?? list[0];
    return d ? this.displayed(d, 80) : null;
  }

  async freeze(): Promise<Record<string, string>> {
    const shots: Record<string, string> = {};
    if (this.visible) {
      await Promise.all(
        this.entries().map(async (d) => {
          const data = await this.displayed(d);
          if (data) shots[d.preset.id] = data;
        }),
      );
    }
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
