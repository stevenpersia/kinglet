import { join } from 'node:path';
import { BaseWindow, WebContentsView, ipcMain, screen, session, type Input, type Session } from 'electron';
import { HEAVY_IMAGE_BYTES, getLanguage, t, type RenderedDevice } from '@parakeet/core';
import { globMatch } from '../shared/mocks';
import type { ApiMock, DeviceLog, DevicePreset, DeviceSlot, ElementInfo, ElementMetrics, InspectState, MediaPrefs, PreviewEvent, ShortcutAction, Throttle } from '../shared/types';

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
const MEASURE = `(async () => {
  const heavy = performance.getEntriesByType('resource')
    .filter((e) => e.initiatorType === 'img' || /\\.(png|jpe?g|webp|gif|avif)(\\?|$)/i.test(e.name))
    .map((e) => ({ url: e.name, bytes: e.transferSize || e.encodedBodySize || 0 }))
    .filter((i) => i.bytes > ${HEAVY_IMAGE_BYTES});
  const visible = (el, r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
  const name = (el) => {
    const txt = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ');
    return el.tagName.toLowerCase() + (txt ? ' « ' + txt.slice(0, 24) + ' »' : '');
  };
  // Tap targets under 24×24 CSS px; a link inside a sentence is exempt (WCAG 2.5.8).
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [onclick]')) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r) || (r.width >= 24 && r.height >= 24)) continue;
    const p = el.parentElement;
    if (el.tagName === 'A' && p && getComputedStyle(el).display === 'inline' && (p.innerText || '').trim().length > (el.innerText || '').trim().length + 20) continue;
    small.push(name(el));
  }
  // Text: size and contrast, on elements that hold their own text.
  const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const L = (c) => 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // image or gradient: unknown
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const tiny = []; let minPx = 99; const low = []; let seen = 0;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const done = new Set();
  while (walker.nextNode() && seen < 600) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || done.has(el) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
    done.add(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    seen++;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const label = '« ' + node.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + ' »';
    if (px < 12) { tiny.push(label); minPx = Math.min(minPx, Math.round(px * 10) / 10); }
    const fg = parse(cs.color); const bg = bgOf(el);
    if (fg && bg && fg.a > 0.5) {
      const a = L(fg), b = L(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) low.push(label + ' ' + ratio.toFixed(1) + ':1');
    }
  }
  // Notch: viewport-fit=cover asks to draw under it; then the CSS should use the safe-area insets.
  const vp = document.querySelector('meta[name=viewport]')?.getAttribute('content') || '';
  let insets = /safe-area-inset/.test(document.documentElement.outerHTML.slice(0, 200000));
  if (!insets) for (const sh of document.styleSheets) { try { for (const rule of sh.cssRules) if (rule.cssText.includes('safe-area-inset')) { insets = true; break; } } catch {} if (insets) break; }
  // Core Web Vitals, from the buffered performance entries.
  const entries = (type) => new Promise((res) => { try { const got = []; const po = new PerformanceObserver((l) => got.push(...l.getEntries())); po.observe({ type, buffered: true }); setTimeout(() => { got.push(...po.takeRecords()); po.disconnect(); res(got); }, 100); } catch { res([]); } });
  const [lcpList, shifts] = await Promise.all([entries('largest-contentful-paint'), entries('layout-shift')]);
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const lcp = lcpList.length ? lcpList[lcpList.length - 1].startTime : null;
  const cls = shifts.filter((e) => !e.hadRecentInput).reduce((s, e) => s + e.value, 0);
  return {
    // Mobile browsers zoom out to fit a too-wide page (innerWidth grows with it): compare with the screen.
    overflowPx: Math.max(0, Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - screen.width),
    heavyImages: heavy,
    links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
    smallTargets: { count: small.length, examples: small.slice(0, 3) },
    smallText: { count: tiny.length, minPx: tiny.length ? minPx : 0, examples: tiny.slice(0, 3) },
    lowContrast: { count: low.length, examples: low.slice(0, 3) },
    notchUnsafe: /viewport-fit\\s*=\\s*cover/.test(vp) && !insets,
    vitals: { lcpMs: lcp != null ? Math.round(lcp) : null, cls: Math.round(cls * 1000) / 1000, fcpMs: fcp ? Math.round(fcp.startTime) : null, ttfbMs: nav ? Math.round(nav.responseStart) : null },
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
  private offline = false;
  private mocks: ApiMock[] = [];
  private media: MediaPrefs = { colorScheme: 'auto', reducedMotion: false, moreContrast: false };
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
    // Inspector: the element hovered on one device is shown and measured on all of them.
    const show = (selector: string, picked: boolean) => {
      if (this.inspectLocked && !picked) return;
      this.inspected = { selector, picked, devices: {} };
      for (const d of this.devices.values()) d.view.webContents.send('device:inspect-show', selector, picked);
    };
    ipcMain.on('device:inspect-hover', (_e, selector: string) => show(selector, false));
    ipcMain.on('device:inspect-pick', (_e, selector: string) => {
      this.inspectLocked = !(this.inspectLocked && this.inspected?.selector === selector);
      show(selector, this.inspectLocked);
    });
    ipcMain.on('device:inspect-metrics', (event, selector: string, m: ElementMetrics | null) => {
      const d = [...this.devices.values()].find((x) => x.view.webContents.id === event.sender.id);
      if (!d || !this.inspected || this.inspected.selector !== selector) return;
      this.inspected.devices[d.preset.id] = m;
      this.emit({ type: 'inspect', state: { ...this.inspected, devices: { ...this.inspected.devices } } });
    });
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
      if (this.inspecting) wc.send('device:inspect-mode', true);
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
    void dbg.sendCommand('Network.enable').then(() => Promise.all([this.applyThrottle(entry), this.applyMedia(entry), this.applyMocks(entry)])).catch(() => undefined);
    dbg.on('message', (_e, method, params) => {
      if (method === 'Fetch.requestPaused') void this.answerPaused(entry, params);
      else if (method === 'Network.requestWillBeSent') {
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

  private inspecting = false;
  private inspectLocked = false;
  private inspected: InspectState | null = null;

  setInspect(on: boolean) {
    this.inspecting = on;
    this.inspectLocked = false;
    this.inspected = null;
    for (const d of this.devices.values()) {
      d.view.webContents.send('device:inspect-mode', on);
      // Touch devices turn the mouse into touches: no hover. The inspector needs a mouse.
      if (d.preset.touch && d.view.webContents.debugger.isAttached())
        void d.view.webContents.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', { enabled: !on, configuration: 'mobile' }).catch(() => undefined);
    }
  }

  /** Dark mode, reduced motion, high contrast: what the page sees in its CSS media queries. */
  setMedia(m: MediaPrefs) {
    this.media = m;
    for (const d of this.devices.values()) void this.applyMedia(d);
  }

  private applyMedia(d: DeviceEntry) {
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      if (!dbg.isAttached()) return;
      const m = this.media;
      await dbg
        .sendCommand('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-color-scheme', value: m.colorScheme === 'auto' ? '' : m.colorScheme },
            { name: 'prefers-reduced-motion', value: m.reducedMotion ? 'reduce' : '' },
            { name: 'prefers-contrast', value: m.moreContrast ? 'more' : '' },
          ],
        })
        .catch((e: Error) => console.error(`[${d.preset.id}] media`, e.message));
    });
  }

  setOffline(on: boolean) {
    this.offline = on;
    for (const d of this.devices.values()) void this.applyThrottle(d);
  }

  /** Simulated API responses: matching requests are answered by Parakeet (Fetch domain). */
  setMocks(mocks: ApiMock[]) {
    this.mocks = mocks;
    for (const d of this.devices.values()) void this.applyMocks(d);
  }

  private applyMocks(d: DeviceEntry) {
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      if (!dbg.isAttached()) return;
      const on = this.mocks.filter((m) => m.enabled && m.pattern.trim());
      if (on.length) await dbg.sendCommand('Fetch.enable', { patterns: on.map((m) => ({ urlPattern: m.pattern.trim(), requestStage: 'Request' })) }).catch((e: Error) => console.error(`[${d.preset.id}] mocks`, e.message));
      else await dbg.sendCommand('Fetch.disable').catch(() => undefined);
    });
  }

  private async answerPaused(d: DeviceEntry, params: { requestId: string; request: { url: string; method: string }; resourceType?: string }) {
    const dbg = d.view.webContents.debugger;
    const mock = this.mocks.find((m) => m.enabled && (m.method === '*' || m.method.toUpperCase() === params.request.method) && globMatch(m.pattern.trim(), params.request.url));
    try {
      if (!mock) return void (await dbg.sendCommand('Fetch.continueRequest', { requestId: params.requestId }));
      if (mock.delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(mock.delayMs, 60_000)));
      await dbg.sendCommand('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: mock.status,
        responseHeaders: [
          { name: 'content-type', value: mock.contentType || 'application/json' },
          { name: 'access-control-allow-origin', value: '*' },
          { name: 'x-parakeet-mock', value: mock.id },
        ],
        body: Buffer.from(mock.body, 'utf8').toString('base64'),
      });
      this.log(d, { source: 'network', level: 'info', text: t(`simulated → ${mock.status}`, `simulée → ${mock.status}`), url: params.request.url, status: mock.status, method: params.request.method, resourceType: params.resourceType });
    } catch {
      /* the page went away */
    }
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
        .sendCommand(
          'Network.emulateNetworkConditions',
          // Offline: every device, screens included (to test the offline page or the error states).
          this.offline ? { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } : net ? { offline: false, ...net } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
        )
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
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: preset.touch && !this.inspecting, configuration: preset.touch ? 'mobile' : 'desktop' });
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
          const m = (await d.view.webContents.executeJavaScript(MEASURE)) as Omit<RenderedDevice, 'id' | 'label' | 'consoleErrors' | 'touch'> & { links: string[] };
          const { links, ...rest } = m;
          return { device: { ...rest, id: d.preset.id, label: d.preset.label, touch: d.preset.touch, consoleErrors: [...d.consoleErrors] }, links };
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
