import { join } from 'node:path';
import { BaseWindow, BrowserWindow, WebContentsView, ipcMain, screen, session, type Input, type Session } from 'electron';
import { HEAVY_IMAGE_BYTES, getLanguage, t, type AxeSummary, type AxeViolation, type RenderedDevice } from '@kinglet/core';
import AXE_SOURCE from 'axe-core/axe.min.js?raw';
import { globMatch } from '../shared/mocks';
import type { FormFill, ApiMock, DeviceLog, DevicePerf, DevicePreset, DeviceSlot, ElementInfo, ElementMetrics, ExportShot, InspectState, MediaPrefs, PreviewEvent, RegionPrefs, ShortcutAction, TabOrderInfo, TextSize, Throttle } from '../shared/types';

export const PREVIEW_PARTITION = 'persist:kinglet-preview';

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
  /** Load time and weight of the last page load (budgets). */
  perf?: Omit<DevicePerf, 'deviceId'>;
}

/** Isolated world where axe-core runs: the page's own scripts don't see it. */
const AXE_WORLD = 1001;

/** Elements reachable with Tab (tabindex -1 aside). */
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable=""], [contenteditable=true], [tabindex]:not([tabindex="-1"])';

/** Styles that tell where the keyboard focus is. */
const FOCUS_PROPS = ['outline-style', 'outline-width', 'outline-color', 'box-shadow', 'background-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'border-bottom-width', 'color', 'text-decoration-line', 'transform', 'opacity', 'filter'];

/** On-screen keyboard height in CSS px: iOS and Gboard with their suggestion bar. */
export function keyboardHeight(preset: DevicePreset, landscape: boolean): number {
  if (preset.kind === 'desktop') return 0;
  if (preset.kind === 'tablet') return landscape ? 400 : 320;
  return landscape ? 200 : preset.userAgent.includes('Android') ? 300 : 336;
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

/**
 * A DevTools command can stay unanswered (a hidden view paints no frame to capture): give up after
 * `ms`, so the device's queue is not blocked forever.
 */
const within = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(t('timed out', 'délai dépassé'))), ms))]);

const serial = <T,>(d: DeviceEntry, job: () => Promise<T>): Promise<T> => {
  const run = (d.queue ?? Promise.resolve()).then(job, job);
  d.queue = run.catch(() => undefined);
  return run;
};

/**
 * What a form field is for, from its type, autocomplete, name, id, placeholder and label.
 * Defines `fieldKind(el)`, `fieldLabel(el)`, `FIELDS` and `EXPECT` in the page (shared by the
 * check and the automatic filling).
 */
const FIELD_KIND = `
const FIELDS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea';
const fieldLabel = (el) => {
  const byId = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
  const txt = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ').trim() || byId?.innerText || el.closest('label')?.innerText || '';
  return txt.trim().replace(/\\s+/g, ' ');
};
const fieldKind = (el) => {
  const type = (el.getAttribute('type') || el.tagName).toLowerCase();
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  const hint = [el.name, el.id, el.getAttribute('placeholder'), ac, fieldLabel(el)].join(' ').toLowerCase();
  if (type === 'checkbox' || type === 'radio' || type === 'select' || type === 'file' || type === 'range' || type === 'color') return type;
  if (type === 'textarea') return 'message';
  if (type === 'password') return /new|nouveau|confirm/.test(hint) ? 'new-password' : 'password';
  if (type === 'date' || type === 'datetime-local' || type === 'time' || type === 'month') return 'date';
  if (type === 'email' || /e-?mail|courriel/.test(hint)) return 'email';
  if (type === 'tel' || /\\b(tel|phone|mobile|portable|téléphone|telephone)/.test(hint)) return 'tel';
  if (type === 'url' || /\\b(url|site web|website)\\b/.test(hint)) return 'url';
  if (/postal|zip|code postal|cp\\b/.test(hint)) return 'postal-code';
  if (/one-time|otp|code de vérification|verification code|\\bcode\\b/.test(hint)) return 'one-time-code';
  if (/cc-number|card ?number|numéro de carte/.test(hint)) return 'cc-number';
  if (/given|first|prénom|prenom/.test(hint)) return 'given-name';
  if (/family|last|nom de famille|surname/.test(hint)) return 'family-name';
  if (/organi[sz]ation|company|société|entreprise/.test(hint)) return 'organization';
  if (/address|adresse|street|rue/.test(hint)) return 'street-address';
  if (/city|ville|locality/.test(hint)) return 'address-level2';
  if (/country|pays/.test(hint)) return 'country-name';
  if (type === 'number' || /quantit|amount|montant|\\bage\\b|nombre/.test(hint)) return 'number';
  if (type === 'search' || /search|recherche/.test(hint)) return 'search';
  if (/\\bname\\b|\\bnom\\b|full ?name|nom complet/.test(hint)) return 'name';
  return 'text';
};
/** The keyboard a kind needs (type or inputmode), and the autocomplete token that lets the browser fill it. */
const EXPECT = {
  email: { keyboard: ['email'], ac: 'email' },
  tel: { keyboard: ['tel'], ac: 'tel' },
  url: { keyboard: ['url'], ac: 'url' },
  'postal-code': { keyboard: ['numeric', 'tel', 'number', 'text'], ac: 'postal-code' },
  'one-time-code': { keyboard: ['numeric', 'number', 'tel'], ac: 'one-time-code' },
  'cc-number': { keyboard: ['numeric', 'number', 'tel'], ac: 'cc-number' },
  number: { keyboard: ['numeric', 'decimal', 'number'], ac: null },
  name: { keyboard: null, ac: 'name' },
  'given-name': { keyboard: null, ac: 'given-name' },
  'family-name': { keyboard: null, ac: 'family-name' },
  organization: { keyboard: null, ac: 'organization' },
  'street-address': { keyboard: null, ac: 'street-address' },
  'address-level2': { keyboard: null, ac: 'address-level2' },
  'country-name': { keyboard: null, ac: 'country' },
  password: { keyboard: null, ac: 'current-password' },
  'new-password': { keyboard: null, ac: 'new-password' },
};
`;

/** Runs inside a device page: what only the rendered page (after JavaScript) can tell. */
const MEASURE = `(async () => {
  ${FIELD_KIND}
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
  const tiny = []; let minPx = 99; const low = []; let seen = 0; const clipped = [];
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
    if (clipped.length < 50) {
      for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) {
        const c = i === 0 ? cs : getComputedStyle(e);
        const hides = /hidden|clip/.test(c.overflowX + c.overflowY) || c.textOverflow === 'ellipsis' || (c.webkitLineClamp && c.webkitLineClamp !== 'none');
        if (hides && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && e.clientHeight > 0) { clipped.push(label); break; }
      }
    }
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
  const [lcpList, shifts, frames] = await Promise.all([entries('largest-contentful-paint'), entries('layout-shift'), entries('long-animation-frame')]);
  // Interaction to Next Paint: the slowest interaction (clicks, taps, keys) since the page loaded.
  const events = await new Promise((res) => { try { const got = []; const po = new PerformanceObserver((l) => got.push(...l.getEntries())); po.observe({ type: 'event', buffered: true, durationThreshold: 16 }); setTimeout(() => { got.push(...po.takeRecords()); po.disconnect(); res(got); }, 100); } catch { res([]); } });
  const byInteraction = new Map();
  for (const e of events) if (e.interactionId) byInteraction.set(e.interactionId, Math.max(byInteraction.get(e.interactionId) || 0, e.duration));
  // Interactions under 16 ms are not reported as events: the first one always is, as first-input.
  const firstInput = (await entries('first-input'))[0];
  if (firstInput && !byInteraction.size) byInteraction.set(firstInput.interactionId || 1, firstInput.duration);
  const resources = performance.getEntriesByType('resource');
  const bytesOf = (r) => r.transferSize || r.encodedBodySize || 0;
  const isJs = (r) => r.initiatorType === 'script' || /\\.m?js(\\?|$)/i.test(r.name);
  const isFont = (r) => /\\.(woff2?|ttf|otf|eot)(\\?|$)/i.test(r.name);
  const js = resources.filter(isJs).map((r) => ({ url: r.name, bytes: bytesOf(r) })).sort((a, b) => b.bytes - a.bytes);
  const fonts = resources.filter(isFont);
  // CSS rules whose selector matches nothing here, and @font-face without font-display.
  let cssBytes = 0, unusedCss = 0, cssRules = 0, cssUnreadable = 0;
  const noDisplay = new Set();
  const strip = (sel) => sel.replace(/::?[\\w-]+(\\((?:[^()]|\\([^()]*\\))*\\))?/g, '').trim();
  const visit = (rules) => {
    for (const rule of rules) {
      if (cssRules > 30000) return;
      if (rule.type === 1) {
        cssRules++;
        const len = rule.cssText.length;
        cssBytes += len;
        const parts = rule.selectorText.split(',').map(strip).map((x) => x.replace(/[>+~]\\s*$/, '').trim() || '*');
        let used = false;
        for (const sel of parts) { try { if (document.querySelector(sel)) { used = true; break; } } catch { used = true; break; } }
        if (!used) unusedCss += len;
      } else if (rule.type === 5) {
        const d = rule.style.getPropertyValue('font-display');
        cssBytes += rule.cssText.length;
        if (!d || d === 'auto' || d === 'block') noDisplay.add((rule.style.getPropertyValue('font-family') || '?').replace(/["']/g, '').trim());
      } else if (rule.cssRules) visit(rule.cssRules);
      else cssBytes += (rule.cssText || '').length;
    }
  };
  for (const sh of document.styleSheets) { try { visit(sh.cssRules); } catch { cssUnreadable++; if (/fonts\\.googleapis\\.com/.test(sh.href || '') && !/[?&]display=/.test(sh.href || '')) noDisplay.add('Google Fonts'); } }
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
    clippedText: { count: clipped.length, examples: clipped.slice(0, 3) },
    forms: (() => {
      const wrongKeyboard = [], noAutocomplete = [], noLabel = [];
      let fields = 0;
      for (const el of document.querySelectorAll(FIELDS)) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || el.disabled || el.closest('[data-kinglet]')) continue;
        fields++;
        const kind = fieldKind(el);
        const label = fieldLabel(el) || el.getAttribute('placeholder') || '';
        const name = '« ' + (label || el.name || el.id || el.tagName.toLowerCase()).slice(0, 24) + ' »';
        if (!label && !el.getAttribute('title')) noLabel.push(name);
        const want = EXPECT[kind];
        if (!want) continue;
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        const mode = (el.getAttribute('inputmode') || '').toLowerCase();
        if (want.keyboard && !want.keyboard.includes(type) && !want.keyboard.includes(mode)) wrongKeyboard.push(name + ' (' + (want.keyboard[0] === 'email' || want.keyboard[0] === 'tel' || want.keyboard[0] === 'url' ? 'type=' + want.keyboard[0] : 'inputmode=' + want.keyboard[0]) + ')');
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        if (want.ac && (!ac || ac === 'on')) noAutocomplete.push(name + ' (' + want.ac + ')');
      }
      return { fields, wrongKeyboard, noAutocomplete, noLabel };
    })(),
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    content: {
      text: ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 100000),
      anchors: [...document.querySelectorAll('a[href]')].filter((a) => !a.closest('[data-kinglet]')).slice(0, 500).map((a) => ({ href: (a.getAttribute('href') || '').trim(), url: /^https?:/.test(a.href) ? a.href : null, text: (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 80) })),
      images: [...document.querySelectorAll('img')].slice(0, 300).map((i) => i.currentSrc || i.src).filter((u) => /^https?:/.test(u)),
    },
    performance: {
      inpMs: byInteraction.size ? Math.round(Math.max(...byInteraction.values())) : null,
      interactions: byInteraction.size,
      blockingMs: Math.round(frames.reduce((s, f) => s + (f.blockingDuration || 0), 0)),
      longFrames: frames.filter((f) => (f.blockingDuration || 0) > 0).length,
      renderBlocking: resources.filter((r) => r.renderBlockingStatus === 'blocking').map((r) => ({ url: r.name, kind: isJs(r) ? 'js' : 'css', ms: Math.round(r.responseEnd - r.startTime) })),
      jsBytes: js.reduce((s, r) => s + r.bytes, 0),
      jsFiles: js.slice(0, 3),
      cssBytes,
      unusedCssBytes: cssRules ? unusedCss : null,
      cssRules,
      cssUnreadable,
      fontBytes: fonts.reduce((s, r) => s + bytesOf(r), 0),
      fontFiles: fonts.length,
      fontsNoDisplay: [...noDisplay].slice(0, 5),
    },
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
/**
 * `inTerminal`: the focus is in Claude's terminal, where Ctrl R, L, K, P, J… belong to the shell
 * and to Claude Code; only the shortcuts that don't clash there stay with the app.
 */
export function shortcutFor(input: Pick<Input, 'type' | 'key' | 'control' | 'meta' | 'shift' | 'alt'>, inTerminal = false): ShortcutAction | null {
  if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  const key = input.key.toLowerCase();
  if (inTerminal && !input.shift && key !== ',' && !/^[1-9]$/.test(key)) return null;
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
  private region: RegionPrefs = { locale: null, timezone: null, geo: null };
  private regionPerDevice: Record<string, Partial<RegionPrefs>> = {};
  private text: TextSize = { scale: 1, zoom: 1 };
  private keyboard = false;
  private tabOrder = false;
  private tabInfo: Record<string, TabOrderInfo> = {};
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
    // Geolocation: granted only to a device that was given a position (otherwise the page sees a refusal).
    const geoAllowed = (wc: Electron.WebContents | null) => {
      const d = wc ? [...this.devices.values()].find((x) => x.view.webContents.id === wc.id) : null;
      return !!d && !!this.regionFor(d.preset.id).geo;
    };
    this.session.setPermissionRequestHandler((wc, permission, cb) => cb(permission !== 'geolocation' || geoAllowed(wc)));
    this.session.setPermissionCheckHandler((wc, permission) => permission !== 'geolocation' || geoAllowed(wc));
    ipcMain.on('device:taborder-info', (event, info: TabOrderInfo) => {
      const d = [...this.devices.values()].find((x) => x.view.webContents.id === event.sender.id);
      if (!d || !this.tabOrder) return;
      this.tabInfo = { ...this.tabInfo, [d.preset.id]: info };
      this.emit({ type: 'taborder', devices: this.tabInfo });
    });
    ipcMain.on('device:scroll', (event, ratio: number) => {
      if (process.env.KINGLET_DEBUG) console.log(`[scroll] from ${event.sender.id} ratio ${ratio}`);
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
    for (const d of this.devices.values()) {
      void this.emulate(d);
      this.sendKeyboard(d);
    }
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

  /** Where an element (by selector) is on each device, in CSS px of its viewport: the same element, everywhere. */
  async rectsOf(selector: string): Promise<Record<string, ElementInfo['rect'] | null>> {
    const code = `(() => { try { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width || r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; } catch { return null; } })()`;
    const out: Record<string, ElementInfo['rect'] | null> = {};
    await Promise.all(
      [...this.devices.values()].map(async (d) => {
        out[d.preset.id] = ((await d.view.webContents.executeJavaScript(code).catch(() => null)) as ElementInfo['rect'] | null) ?? null;
      }),
    );
    return out;
  }

  /**
   * A page on another environment, rendered off screen like one of the devices: a PNG of the
   * viewport (CSS px) and the Core Web Vitals. For the visual comparison of local, preview, prod.
   */
  async snapshot(url: string, presetId: string): Promise<{ image: string | null; vitals: RenderedDevice['vitals'] | null; error: string | null; measured?: RenderedDevice | null; perf?: { bytes: number; requests: number; loadMs: number } | null }> {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return { image: null, vitals: null, error: 'unknown device' };
    const { width, height } = this.viewport(preset);
    const win = new BrowserWindow({ show: false, width, height, useContentSize: true, webPreferences: { offscreen: true, session: this.session, sandbox: true } });
    try {
      const wc = win.webContents;
      wc.setAudioMuted(true);
      if (preset.userAgent) wc.setUserAgent(preset.userAgent);
      const timeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(t('timed out', 'délai dépassé'))), 20_000))]);
      // Load first: emulating before the first navigation fails (the renderer process changes).
      await timeout(wc.loadURL(url));
      const dbg = wc.debugger;
      dbg.attach('1.3');
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: preset.mobile, screenWidth: width, screenHeight: height });
      if (preset.touch) await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const m = this.media;
      await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: m.colorScheme === 'auto' ? '' : m.colorScheme }, { name: 'prefers-reduced-motion', value: m.reducedMotion ? 'reduce' : '' }] });
      const r = this.regionFor(preset.id);
      if (r.locale) await dbg.sendCommand('Emulation.setLocaleOverride', { locale: r.locale }).catch(() => undefined);
      if (r.timezone) await dbg.sendCommand('Emulation.setTimezoneOverride', { timezoneId: r.timezone }).catch(() => undefined);
      // Budgets and history are measured like the phones are: with the throttling chosen.
      if (preset.kind !== 'desktop' && this.throttle.network !== 'off') await dbg.sendCommand('Network.emulateNetworkConditions', { offline: false, ...NETWORK_PROFILES[this.throttle.network] }).catch(() => undefined);
      if (preset.kind !== 'desktop' && this.throttle.cpu > 1) await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: this.throttle.cpu }).catch(() => undefined);
      // Then load again, emulated, so the page and its Web Vitals are the device's.
      await timeout(new Promise<void>((res) => {
        wc.once('did-finish-load', () => res());
        wc.reload();
      }));
      await new Promise((r) => setTimeout(r, 1200)); // late scripts, fonts, images
      const measured = (await wc.executeJavaScript(MEASURE).catch(() => null)) as (Omit<RenderedDevice, 'id' | 'label' | 'consoleErrors'> & { links?: string[] }) | null;
      const perf = (await wc.executeJavaScript(PERF).catch(() => null)) as { bytes: number; requests: number; loadMs: number } | null;
      const { data } = (await dbg.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })) as { data: string };
      const { links: _links, ...rest } = measured ?? {};
      return {
        image: `data:image/png;base64,${data}`,
        vitals: measured?.vitals ?? null,
        error: null,
        measured: measured ? ({ ...rest, id: preset.id, label: preset.label, touch: preset.touch, consoleErrors: [] } as RenderedDevice) : null,
        perf,
      };
    } catch (e) {
      return { image: null, vitals: null, error: (e as Error).message };
    } finally {
      win.destroy();
    }
  }

  /**
   * Ids and anchor names of a page once its JavaScript has run (off screen, like a screen):
   * an anchor added by a framework is not in the raw HTML the audit reads.
   */
  async renderedIds(url: string): Promise<string[] | null> {
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, session: this.session, sandbox: true } });
    try {
      win.webContents.setAudioMuted(true);
      await within(win.webContents.loadURL(url), 20_000);
      await new Promise((r) => setTimeout(r, 1200)); // client-side rendering, late content
      return (await within(win.webContents.executeJavaScript(`[...document.querySelectorAll('[id]')].map((e) => e.id).concat([...document.querySelectorAll('a[name]')].map((e) => e.getAttribute('name')))`), 5000)) as string[];
    } catch {
      return null;
    } finally {
      win.destroy();
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
    void this.applyText(entry);

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
      // Kinglet's own preload scripts.
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
      this.sendKeyboard(entry);
      if (this.tabOrder) void this.showTabOrder(entry);
      if (this.isPrimary(preset.id)) this.emit({ type: 'loaded', url: wc.getURL() });
      // loadEventEnd is set once the load handlers have run.
      setTimeout(async () => {
        if (wc.isDestroyed()) return;
        const perf = (await wc.executeJavaScript(PERF).catch(() => null)) as Omit<import('../shared/types').DevicePerf, 'deviceId' | 'url'> | null;
        if (perf) {
          entry.perf = { ...perf, url: wc.getURL() };
          this.emit({ type: 'perf', perf: { ...perf, deviceId: preset.id, url: wc.getURL() } });
        }
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
    void dbg.sendCommand('Network.enable').then(() => Promise.all([this.applyThrottle(entry), this.applyMedia(entry), this.applyMocks(entry), this.applyRegion(entry)])).catch(() => undefined);
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

  /** What one device pretends: the global region, with this device's own changes. */
  regionFor(id: string): RegionPrefs {
    return { ...this.region, ...(this.regionPerDevice[id] ?? {}) };
  }

  /** Language, time zone and position: Intl, navigator.language, Accept-Language, navigator.geolocation. */
  setRegion(all: RegionPrefs, perDevice: Record<string, Partial<RegionPrefs>>) {
    this.region = all;
    this.regionPerDevice = perDevice ?? {};
    for (const d of this.devices.values()) {
      void this.applyRegion(d);
      void this.emulate(d); // Accept-Language goes with the user agent override
    }
  }

  private applyRegion(d: DeviceEntry) {
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      if (!dbg.isAttached()) return;
      const r = this.regionFor(d.preset.id);
      const send = (m: string, p: object = {}) => dbg.sendCommand(m, p).catch((e: Error) => console.error(`[${d.preset.id}] ${m}`, e.message));
      await send('Emulation.setLocaleOverride', {});
      if (r.locale) await send('Emulation.setLocaleOverride', { locale: r.locale });
      await send('Emulation.setTimezoneOverride', { timezoneId: r.timezone ?? '' });
      if (r.geo) await send('Emulation.setGeolocationOverride', { latitude: r.geo.latitude, longitude: r.geo.longitude, accuracy: 30 });
      else await send('Emulation.clearGeolocationOverride');
    });
  }

  /** Bigger default font size (what the browser's text size does) and page zoom. */
  setText(text: TextSize) {
    const zoomChanged = text.zoom !== this.text.zoom;
    this.text = text;
    for (const d of this.devices.values()) {
      void this.applyText(d);
      if (zoomChanged) void this.emulate(d);
    }
  }

  get textSize() {
    return this.text;
  }

  private applyText(d: DeviceEntry) {
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      if (!dbg.isAttached()) return;
      const k = this.text.scale || 1;
      await dbg.sendCommand('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * k), fixed: Math.round(13 * k) } }).catch((e: Error) => console.error(`[${d.preset.id}] font sizes`, e.message));
    });
  }

  /** The on-screen keyboard, drawn inside the page (it covers it, like iOS and Chrome on Android by default). */
  setKeyboard(on: boolean) {
    this.keyboard = on;
    for (const d of this.devices.values()) this.sendKeyboard(d);
  }

  private sendKeyboard(d: DeviceEntry) {
    if (d.view.webContents.isDestroyed()) return;
    const h = this.keyboard ? keyboardHeight(d.preset, this.landscape) : 0;
    d.view.webContents.send('device:keyboard', { on: h > 0, height: h, android: d.preset.userAgent.includes('Android'), lang: this.regionFor(d.preset.id).locale ?? getLanguage() });
  }

  /** Keyboard tour on every device: elements numbered in Tab order, the ones without visible focus in red. */
  setTabOrder(on: boolean) {
    this.tabOrder = on;
    this.tabInfo = {};
    for (const d of this.devices.values()) {
      if (on) void this.showTabOrder(d);
      else {
        d.view.webContents.send('device:taborder', false);
        void this.markNoFocus(d, []).catch(() => undefined);
      }
    }
    if (!on) this.emit({ type: 'taborder', devices: {} });
  }

  private async showTabOrder(d: DeviceEntry) {
    const audit = await serial(d, () => within(this.focusAudit(d, true), 10_000)).catch(() => null);
    if (!this.tabOrder || d.view.webContents.isDestroyed()) return;
    d.view.webContents.send('device:taborder', true, audit?.count ?? 0);
  }

  /**
   * Which focusable elements show no visible change when they get the keyboard focus: their styles
   * with :focus and :focus-visible forced (DevTools protocol, nothing moves on the page) against without.
   */
  async focusAudit(d: DeviceEntry, mark = false): Promise<NonNullable<RenderedDevice['focusMissing']>> {
    const dbg = d.view.webContents.debugger;
    const send = <T,>(m: string, p: object = {}) => dbg.sendCommand(m, p) as Promise<T>;
    await send('DOM.enable');
    await send('CSS.enable');
    try {
      const { root } = await send<{ root: { nodeId: number } }>('DOM.getDocument', { depth: 0 });
      const { nodeIds } = await send<{ nodeIds: number[] }>('DOM.querySelectorAll', { nodeId: root.nodeId, selector: FOCUSABLE });
      const styleOf = async (nodeId: number) => {
        const { computedStyle } = await send<{ computedStyle: { name: string; value: string }[] }>('CSS.getComputedStyleForNode', { nodeId });
        return Object.fromEntries(computedStyle.filter((x) => FOCUS_PROPS.includes(x.name)).map((x) => [x.name, x.value]));
      };
      const missing: number[] = [];
      const examples: string[] = [];
      let total = 0;
      for (const nodeId of nodeIds.slice(0, 120)) {
        // Not rendered (display: none, detached): no box model.
        const box = await send<{ model: { width: number; height: number } }>('DOM.getBoxModel', { nodeId }).catch(() => null);
        if (!box || box.model.width < 1 || box.model.height < 1) continue;
        const before = await styleOf(nodeId);
        if (before['visibility'] === 'hidden' || before['opacity'] === '0') continue;
        total++;
        await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
        const after = await styleOf(nodeId).catch(() => before);
        await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => undefined);
        const outline = after['outline-style'] !== 'none' && after['outline-width'] !== '0px';
        const changed = outline || FOCUS_PROPS.some((k) => k !== 'outline-style' && k !== 'outline-width' && before[k] !== after[k]);
        if (changed) continue;
        missing.push(nodeId);
        if (examples.length < 3) {
          const { outerHTML } = await send<{ outerHTML: string }>('DOM.getOuterHTML', { nodeId }).catch(() => ({ outerHTML: '' }));
          const tag = /^<(\w+)/.exec(outerHTML)?.[1] ?? '?';
          const txt = outerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
          examples.push(`${tag}${txt ? ` « ${txt} »` : ''}`);
        }
      }
      if (mark) await this.markNoFocus(d, missing);
      return { count: missing.length, total, examples };
    } finally {
      if (!mark) {
        await send('CSS.disable').catch(() => undefined);
        await send('DOM.disable').catch(() => undefined);
      }
    }
  }

  /** The keyboard tour shows these elements in red (an attribute the preload reads). */
  private async markNoFocus(d: DeviceEntry, nodeIds: number[]) {
    const dbg = d.view.webContents.debugger;
    if (!nodeIds.length) {
      await d.view.webContents.executeJavaScript(`document.querySelectorAll('[data-kinglet-nofocus]').forEach((e) => e.removeAttribute('data-kinglet-nofocus'))`).catch(() => undefined);
      return;
    }
    for (const nodeId of nodeIds) await dbg.sendCommand('DOM.setAttributeValue', { nodeId, name: 'data-kinglet-nofocus', value: '1' }).catch(() => undefined);
  }

  /** axe-core in an isolated world of the page (the site's scripts don't see it). */
  private async runAxe(d: DeviceEntry): Promise<AxeSummary | null> {
    const wc = d.view.webContents;
    const code = `(async () => {
      if (!window.axe) { ${AXE_SOURCE}\n }
      window.axe.configure({ locale: undefined });
      const r = await window.axe.run({ exclude: [['[data-kinglet]'], ['[data-kinglet-inspector]']] }, { resultTypes: ['violations'] });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact || 'minor', help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => [].concat(n.target).join(' ')) })),
        passes: r.passes.length,
        incomplete: r.incomplete.length,
      };
    })()`;
    try {
      const r = (await Promise.race([wc.executeJavaScriptInIsolatedWorld(AXE_WORLD, [{ code }]), new Promise((res) => setTimeout(() => res(null), 15_000))])) as Omit<AxeSummary, 'violations'> & { violations: Omit<AxeViolation, 'devices'>[] } | null;
      if (!r) return null;
      return { ...r, violations: r.violations.map((v) => ({ ...v, devices: [d.preset.label] })) };
    } catch (e) {
      console.error(`[${d.preset.id}] axe`, (e as Error).message);
      return null;
    }
  }

  /**
   * Fill every form of every device: plausible data (`valid`), wrong data and empty required
   * fields (`invalid`), or nothing (`clear`). Values go through the native setter and input/change
   * events, so React, Vue and Svelte see them. Nothing is submitted.
   */
  async fillForms(mode: 'valid' | 'invalid' | 'clear'): Promise<Record<string, FormFill>> {
    const out: Record<string, FormFill> = {};
    await Promise.all(
      this.entries().map(async (d) => {
        // The device's region decides, else the page's own language, else Kinglet's.
        const locale = this.regionFor(d.preset.id).locale;
        const code = `(() => {
          ${FIELD_KIND}
          const mode = ${JSON.stringify(mode)};
          const fr = (${JSON.stringify(locale)} || document.documentElement.lang || ${JSON.stringify(getLanguage())}).toLowerCase().startsWith('fr');
          const VALID = {
            email: 'camille.martin@example.com', tel: fr ? '06 12 34 56 78' : '(555) 010-0199', url: 'https://example.com', 'postal-code': fr ? '69001' : '94103',
            'one-time-code': '123456', 'cc-number': '4242 4242 4242 4242', number: '3', name: 'Camille Martin', 'given-name': 'Camille', 'family-name': 'Martin',
            organization: fr ? 'Atelier Sable' : 'Sable Studio', 'street-address': fr ? '12 rue des Lilas' : '12 Lilac Street', 'address-level2': fr ? 'Lyon' : 'San Francisco',
            'country-name': fr ? 'France' : 'United States', password: 'Kinglet-2026!', 'new-password': 'Kinglet-2026!', search: fr ? 'bol en grès' : 'stoneware bowl',
            message: fr ? 'Bonjour, je voudrais des informations sur vos pièces.' : 'Hello, I would like to know more about your pieces.', text: fr ? 'Test Kinglet' : 'Kinglet test', date: '2026-06-15',
          };
          const INVALID = { email: 'camille@', tel: 'abc', url: 'pas une url', 'postal-code': 'ABCDE', 'one-time-code': 'abc', 'cc-number': '1234', number: '-999999999', date: '' };
          const set = (el, value) => {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };
          const check = (el, on) => {
            if (el.checked === on) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set.call(el, on);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('click', { bubbles: true }));
          };
          const radios = new Set();
          const fields = [];
          for (const el of document.querySelectorAll(FIELDS)) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1 || el.disabled || el.readOnly || el.closest('[data-kinglet]')) continue;
            const kind = fieldKind(el);
            const label = (fieldLabel(el) || el.getAttribute('placeholder') || el.name || el.id || el.tagName.toLowerCase()).slice(0, 32);
            if (kind === 'file' || kind === 'range' || kind === 'color') continue;
            if (kind === 'checkbox') check(el, mode === 'valid');
            else if (kind === 'radio') {
              if (radios.has(el.name)) continue;
              radios.add(el.name);
              check(el, mode === 'valid');
            } else if (kind === 'select') {
              const opts = [...el.options].filter((o) => !o.disabled);
              const pick = mode === 'valid' ? opts.find((o) => o.value) ?? opts[0] : opts.find((o) => !o.value) ?? opts[0];
              if (pick) set(el, mode === 'clear' ? (opts[0]?.value ?? '') : pick.value);
            } else {
              const v = mode === 'clear' ? '' : mode === 'valid' ? (VALID[kind] ?? VALID.text) : (kind in INVALID ? INVALID[kind] : el.required ? '' : (VALID[kind] ?? VALID.text));
              set(el, el.maxLength > 0 ? v.slice(0, el.maxLength) : v);
            }
            fields.push({ label, kind, valid: el.checkValidity(), message: el.validationMessage || '' });
          }
          // Wrong data the field takes without complaining: it has no validation at all.
          const accepted = mode === 'invalid' ? fields.filter((f) => f.valid && (f.kind in INVALID) && f.kind !== 'date').map((f) => f.label) : [];
          const refused = fields.filter((f) => !f.valid).map((f) => f.label + (f.message ? ' — ' + f.message : ''));
          return { filled: fields.length, accepted, refused };
        })()`;
        try {
          out[d.preset.id] = (await within(d.view.webContents.executeJavaScriptInIsolatedWorld(AXE_WORLD, [{ code }]), 8000)) as FormFill;
        } catch (e) {
          out[d.preset.id] = { filled: 0, accepted: [], refused: [], error: (e as Error).message };
        }
      }),
    );
    return out;
  }

  /** Last load of every device: weight, requests, timings. */
  perfs() {
    return this.entries().flatMap((d) => (d.perf ? [{ deviceId: d.preset.id, label: d.preset.label, ...d.perf }] : []));
  }

  /**
   * PNG of a device: its viewport, or the whole page (cut at 10 000 CSS px).
   * Twice the CSS size, whatever the device's density: sharp, and not too heavy.
   */
  async shot(id: string, full: boolean): Promise<ExportShot | null> {
    const d = this.devices.get(id);
    if (!d) return null;
    return serial(d, async () => {
      const dbg = d.view.webContents.debugger;
      try {
        const m = (await within(dbg.sendCommand('Page.getLayoutMetrics'), 3000)) as { cssContentSize: { width: number; height: number }; cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number } };
        const vv = m.cssVisualViewport;
        const max = 10_000;
        const height = full ? Math.min(Math.ceil(m.cssContentSize.height), max) : vv.clientHeight;
        const width = vv.clientWidth;
        const scale = Math.min(1, 2 / (d.preset.dpr * (this.text.zoom || 1)));
        const { data } = (await within(
          dbg.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: full,
            clip: { x: full ? 0 : vv.pageX, y: full ? 0 : vv.pageY, width, height, scale },
          }),
          15_000,
        )) as { data: string };
        if (full) await this.emulateNow(d); // captureBeyondViewport can leave the metrics changed
        return { id, label: d.preset.label, width, height, dataUrl: `data:image/png;base64,${data}`, cut: full && m.cssContentSize.height > max };
      } catch (e) {
        console.error(`[${id}] shot`, (e as Error).message);
        return null;
      }
    });
  }

  /** What every device shows right now (video frames). */
  async frames(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(
      this.entries().map(async (d) => {
        const data = await this.displayed(d, 80);
        if (data) out[d.preset.id] = data;
      }),
    );
    return out;
  }

  /** Scroll every device to the same ratio, synced or not. */
  scrollAll(ratio: number) {
    for (const d of this.devices.values()) d.view.webContents.send('device:scroll-to', ratio);
  }

  setOffline(on: boolean) {
    this.offline = on;
    for (const d of this.devices.values()) void this.applyThrottle(d);
  }

  /** Simulated API responses: matching requests are answered by Kinglet (Fetch domain). */
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
          { name: 'x-kinglet-mock', value: mock.id },
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
    const screenSize = this.viewport(preset);
    const landscape = screenSize.width > screenSize.height && preset.kind !== 'desktop';
    // Page zoom: the page is laid out at width / zoom CSS px and drawn zoom times bigger.
    const zoom = this.text.zoom || 1;
    const width = Math.round(screenSize.width / zoom);
    const height = Math.round(screenSize.height / zoom);
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: preset.dpr * zoom,
      mobile: preset.mobile,
      scale: scale * zoom,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: preset.touch, maxTouchPoints: preset.touch ? 5 : 1 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: preset.touch && !this.inspecting, configuration: preset.touch ? 'mobile' : 'desktop' });
    const locale = this.regionFor(preset.id).locale;
    const acceptLanguage = locale ? `${locale},${locale.split('-')[0]};q=0.9` : undefined;
    if (preset.userAgent) {
      const platform = preset.userAgent.includes('Android') ? 'Linux armv81' : preset.userAgent.includes('iPhone') ? 'iPhone' : 'MacIntel';
      await send('Emulation.setUserAgentOverride', { userAgent: preset.userAgent, platform, ...(acceptLanguage ? { acceptLanguage } : {}) });
    } else await send('Emulation.setUserAgentOverride', { userAgent: d.view.webContents.getUserAgent(), ...(acceptLanguage ? { acceptLanguage } : {}) });
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
   * Scroll a device to an element (CSS selector, centred) or to a vertical position, so a
   * capture shows what is below the fold. Returns false when the selector matches nothing.
   */
  async scrollTo(id: string, to: { selector?: string; y?: number }): Promise<boolean> {
    const d = this.devices.get(id);
    if (!d) return false;
    const code = `(() => {
      const sel = ${JSON.stringify(to.selector ?? null)};
      if (sel) {
        let el = null;
        try { el = document.querySelector(sel); } catch { return false; }
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        return true;
      }
      window.scrollTo({ top: ${Number(to.y) || 0}, behavior: 'instant' });
      return true;
    })()`;
    try {
      const ok = (await within(d.view.webContents.executeJavaScript(code), 3000)) as boolean;
      // Let lazy images and sticky headers settle before the capture.
      await new Promise((r) => setTimeout(r, 350));
      return ok;
    } catch {
      return false;
    }
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
      const { cssVisualViewport: vv } = (await within(dbg.sendCommand('Page.getLayoutMetrics'), 3000)) as {
        cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
      };
      const { data } = (await within(
        dbg.sendCommand('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 80,
          clip: { x: vv.pageX, y: vv.pageY, width: vv.clientWidth, height: vv.clientHeight, scale },
        }),
        8000,
      )) as { data: string };
      return data;
    } catch {
      try {
        const img = await within(d.view.webContents.capturePage(), 3000);
        return img.isEmpty() ? null : img.toJPEG(80).toString('base64');
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
      const full = await within(d.view.webContents.capturePage(), 3000);
      if (full.isEmpty()) return null;
      // With the emulation scale, the page is sometimes painted in the top-left `scale` part of a
      // larger surface, sometimes right at the view's size (after a resize): crop only in the first case.
      const { width, height } = full.getSize();
      // The surface is either the view's size or the unscaled viewport (view ÷ scale): pick the
      // closer one. A fixed threshold missed scales near 1 and left an empty band in the snapshot,
      // which then showed stretched and shifted under menus.
      const sf = (await this.uiScale()) || screen.getDisplayMatching(this.window.getBounds()).scaleFactor;
      const viewW = d.view.getBounds().width * sf;
      const larger = d.scale < 0.999 && Math.abs(width - viewW / d.scale) < Math.abs(width - viewW);
      const img = larger ? full.crop({ x: 0, y: 0, width: Math.max(1, Math.round(width * d.scale)), height: Math.max(1, Math.round(height * d.scale)) }) : full;
      return img.isEmpty() ? null : `data:image/jpeg;base64,${img.toJPEG(quality).toString('base64')}`;
    } catch {
      return null; // not painted yet
    }
  }

  /** Real pixel ratio of the window (exact with fractional scaling, e.g. on Wayland). */
  private async uiScale(): Promise<number> {
    const wc = (this.window as BaseWindow & { webContents?: Electron.WebContents }).webContents;
    if (!wc) return 0;
    try {
      const r = (await within(wc.executeJavaScript('window.devicePixelRatio'), 1000)) as number;
      return r > 0 ? r / (wc.getZoomFactor() || 1) : 0;
    } catch {
      return 0;
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

  /**
   * New captures while frozen (a menu is open): an option changed in the menu (tab order, text size,
   * dark mode…) shows on the devices right away, not only once the menu closes. The views stay hidden.
   */
  async refreeze(): Promise<Record<string, string>> {
    if (!this.frozen || !this.visible) return {};
    const shots: Record<string, string> = {};
    await Promise.all(
      this.entries().map(async (d) => {
        const data = await this.displayed(d);
        if (data) shots[d.preset.id] = data;
      }),
    );
    return shots;
  }

  unfreeze() {
    this.frozen = false;
    for (const d of this.devices.values()) d.view.setVisible(this.visible);
  }

  /**
   * Rendered-page measures of every device, plus the links found in the first one.
   * Accessibility (axe-core, keyboard focus) runs on the first device of each kind: phone, tablet, screen.
   */
  async measure(opts: { a11y?: boolean } = {}): Promise<{ devices: RenderedDevice[]; links: string[] }> {
    const kinds = new Set<string>();
    const results = await Promise.all(
      this.entries().map(async (d) => {
        const url = d.view.webContents.getURL();
        if (!/^https?:/.test(url)) return null;
        const a11y = opts.a11y !== false && !kinds.has(d.preset.kind);
        kinds.add(d.preset.kind);
        try {
          const [m, axe, focusMissing] = await Promise.all([
            d.view.webContents.executeJavaScript(MEASURE) as Promise<Omit<RenderedDevice, 'id' | 'label' | 'consoleErrors' | 'touch'> & { links: string[] }>,
            a11y ? this.runAxe(d) : Promise.resolve(null),
            a11y && !this.tabOrder ? serial(d, () => within(this.focusAudit(d), 10_000)).catch(() => null) : Promise.resolve(null),
          ]);
          const { links, ...rest } = m;
          return { device: { ...rest, id: d.preset.id, label: d.preset.label, touch: d.preset.touch, consoleErrors: [...d.consoleErrors], textScale: this.text.scale || 1, ...(axe ? { axe } : {}), ...(focusMissing ? { focusMissing } : {}) }, links };
        } catch {
          return null;
        }
      }),
    );
    const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
    // The page's text is the same on every device: keep the first one's.
    return { devices: ok.map((r, i) => (i === 0 ? r.device : { ...r.device, content: undefined })), links: ok[0]?.links ?? [] };
  }

  openDevtools(id: string) {
    this.devices.get(id)?.view.webContents.openDevTools({ mode: 'detach', title: `Kinglet — ${id}` });
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
