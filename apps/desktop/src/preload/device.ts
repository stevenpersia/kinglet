// Runs inside every emulated device page. Keeps scroll positions in sync across devices.
import { ipcRenderer } from 'electron';

let suppressUntil = 0;
let frame = 0;

const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

window.addEventListener(
  'scroll',
  () => {
    if (Date.now() < suppressUntil) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const max = maxScroll();
      ipcRenderer.send('device:scroll', max > 0 ? window.scrollY / max : 0);
    });
  },
  { passive: true },
);

ipcRenderer.on('device:scroll-to', (_e, ratio: number) => {
  suppressUntil = Date.now() + 200;
  window.scrollTo({ top: Math.round(ratio * maxScroll()), behavior: 'instant' });
});

// ---- Inspector: hover an element on one device, see it on all of them ----

let inspecting = false;
let box: HTMLDivElement | null = null;
let hovered: Element | null = null;

/** A selector that finds the same element on the other devices: tag + :nth-of-type down from body (or an id). */
function pathOf(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
    if (e.id) {
      parts.unshift(`#${CSS.escape(e.id)}`);
      break;
    }
    if (e === document.body) {
      parts.unshift('body');
      break;
    }
    const parent: Element | null = e.parentElement;
    const same = parent ? [...parent.children].filter((c) => c.tagName === e!.tagName) : [];
    parts.unshift(e.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ''));
  }
  return parts.join(' > ');
}

function outline(el: Element | null, color: string) {
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-kinglet-inspector', '');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border-radius:2px;transition:all 60ms;';
    document.documentElement.appendChild(box);
  }
  if (!el) return void (box.style.display = 'none');
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, outline: `2px solid ${color}`, background: `${color}22` });
}

function metrics(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const four = (p: string) => ['top', 'right', 'bottom', 'left'].map((s) => Math.round(parseFloat(cs.getPropertyValue(`${p}-${s}`)) || 0)).join(' ');
  return {
    tag: el.tagName.toLowerCase(),
    text: ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
    width: Math.round(r.width),
    height: Math.round(r.height),
    x: Math.round(r.left),
    y: Math.round(r.top + window.scrollY),
    margin: four('margin'),
    padding: four('padding'),
    font: `${Math.round(parseFloat(cs.fontSize) * 10) / 10}px ${cs.fontWeight} ${cs.fontFamily.split(',')[0]!.replace(/["']/g, '')}`,
    lineHeight: cs.lineHeight,
    color: cs.color,
    background: cs.backgroundColor,
    display: cs.display,
  };
}

const onMove = (e: MouseEvent) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  // The page itself (html, body) is not an element worth inspecting.
  if (!el || el === hovered || el === document.documentElement || el === document.body || (el as HTMLElement).hasAttribute?.('data-kinglet-inspector')) return;
  hovered = el;
  ipcRenderer.send('device:inspect-hover', pathOf(el));
};
const onClick = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  if (hovered) ipcRenderer.send('device:inspect-pick', pathOf(hovered));
};

ipcRenderer.on('device:inspect-mode', (_e, on: boolean) => {
  inspecting = on;
  if (on) {
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
  } else {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    hovered = null;
    outline(null, '');
  }
});

// Highlight the element on this device and say what it looks like here.
ipcRenderer.on('device:inspect-show', (_e, selector: string, picked: boolean) => {
  if (!inspecting) return;
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    /* invalid selector */
  }
  outline(el, picked ? '#d97757' : '#8ab4f8');
  ipcRenderer.send('device:inspect-metrics', selector, metrics(el));
});

// ---- On-screen keyboard: drawn over the bottom of the page, like iOS and Chrome on Android by default ----

let keyboardEl: HTMLDivElement | null = null;
let keyboardH = 0;

function drawKeyboard(height: number, android: boolean, lang: string) {
  keyboardEl?.remove();
  keyboardEl = null;
  keyboardH = height;
  if (!height) return;
  const fr = lang.toLowerCase().startsWith('fr');
  const rows = fr ? ['azertyuiop', 'qsdfghjklm', 'wxcvbn'] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const el = document.createElement('div');
  el.setAttribute('data-kinglet', 'keyboard');
  el.setAttribute('aria-hidden', 'true');
  const bg = android ? '#202124' : '#d1d3d9';
  const key = android ? '#3c4043' : '#ffffff';
  const fg = android ? '#e8eaed' : '#000000';
  el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${height}px;z-index:2147483646;background:${bg};display:flex;flex-direction:column;gap:${Math.round(height / 28)}px;padding:${Math.round(height / 22)}px 3px ${Math.round(height / 9)}px;box-sizing:border-box;font:400 ${Math.round(height / 14)}px -apple-system,system-ui,sans-serif;color:${fg};user-select:none;`;
  const bar = document.createElement('div');
  bar.style.cssText = `display:flex;justify-content:space-around;flex:0.8;align-items:center;font-size:0.85em;opacity:0.75`;
  for (const w of fr ? ['Je', 'Le', 'Bonjour'] : ['I', 'The', 'Hello']) bar.appendChild(Object.assign(document.createElement('span'), { textContent: w }));
  el.appendChild(bar);
  for (const [i, r] of [...rows, ' '].entries()) {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:4px;flex:1;justify-content:center;padding:0 ${i === 1 && !fr ? '5%' : '0'}`;
    const keys = i === 3 ? ['123', '', '⏎'] : r.split('');
    for (const k of keys) {
      const b = document.createElement('span');
      b.textContent = k === '' ? (fr ? 'espace' : 'space') : k;
      const wide = i === 3 ? (k === '' ? 5 : 1.4) : 1;
      b.style.cssText = `flex:${wide};max-width:${i === 3 ? 'none' : '10%'};display:flex;align-items:center;justify-content:center;background:${key};border-radius:${android ? 6 : 5}px;box-shadow:0 1px 0 rgba(0,0,0,0.3);font-size:${k.length > 1 || k === '' ? '0.6em' : '1em'}`;
      row.appendChild(b);
    }
    el.appendChild(row);
  }
  document.documentElement.appendChild(el);
  keyboardEl = el;
}

// A field that gets the focus is brought above the keyboard, as the phone does.
window.addEventListener(
  'focusin',
  (e) => {
    if (!keyboardH) return;
    const el = e.target as HTMLElement;
    if (!el?.matches?.('input, textarea, select, [contenteditable]')) return;
    const r = el.getBoundingClientRect();
    const limit = window.innerHeight - keyboardH - 12;
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: 'instant' });
  },
  true,
);

ipcRenderer.on('device:keyboard', (_e, k: { on: boolean; height: number; android: boolean; lang: string }) => {
  const draw = () => drawKeyboard(k.on ? k.height : 0, k.android, k.lang);
  if (document.documentElement) draw();
  else window.addEventListener('DOMContentLoaded', draw, { once: true });
});

// ---- Keyboard tour: every element reachable with Tab, numbered in order ----

const TABBABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable=""], [contenteditable=true], [tabindex]:not([tabindex="-1"])';
let tourLayer: HTMLDivElement | null = null;
let tourFrame = 0;

/** Sequential focus order: tabindex > 0 first (ascending), then the others in document order. */
function tabOrder(): HTMLElement[] {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.closest('[inert], [data-kinglet]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  const pos = all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...pos, ...all.filter((e) => e.tabIndex <= 0)];
}

function drawTour() {
  if (!tourLayer) return;
  const els = tabOrder().slice(0, 200);
  const sx = window.scrollX;
  const sy = window.scrollY;
  const pts: string[] = [];
  const badges: string[] = [];
  let missing = 0;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const bad = el.hasAttribute('data-kinglet-nofocus');
    if (bad) missing++;
    const x = r.left + sx;
    const y = r.top + sy;
    pts.push(`${Math.round(x + 9)},${Math.round(y + 9)}`);
    const color = bad ? '#e5484d' : el.tabIndex > 0 ? '#e6a23c' : '#3e7bfa';
    badges.push(
      `<div style="position:absolute;left:${x - 1}px;top:${y - 1}px;width:${r.width + 2}px;height:${r.height + 2}px;outline:1.5px ${bad ? 'solid' : 'dashed'} ${color};border-radius:3px"></div>` +
        `<div style="position:absolute;left:${x - 4}px;top:${y - 4}px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:${color};color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
    );
  });
  const w = document.documentElement.scrollWidth;
  const h = document.documentElement.scrollHeight;
  tourLayer.style.width = `${w}px`;
  tourLayer.style.height = `${h}px`;
  tourLayer.innerHTML = `<svg width="${w}" height="${h}" style="position:absolute;left:0;top:0"><polyline points="${pts.join(' ')}" fill="none" stroke="#3e7bfa" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="4 3"/></svg>${badges.join('')}`;
  ipcRenderer.send('device:taborder-info', { count: els.length, missing, positive: els.filter((e) => e.tabIndex > 0).length });
}

const redrawTour = () => {
  cancelAnimationFrame(tourFrame);
  tourFrame = requestAnimationFrame(drawTour);
};

ipcRenderer.on('device:taborder', (_e, on: boolean) => {
  tourLayer?.remove();
  tourLayer = null;
  window.removeEventListener('resize', redrawTour);
  if (!on) return;
  tourLayer = document.createElement('div');
  tourLayer.setAttribute('data-kinglet', 'tab-order');
  tourLayer.setAttribute('aria-hidden', 'true');
  tourLayer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483645;';
  document.documentElement.appendChild(tourLayer);
  window.addEventListener('resize', redrawTour);
  drawTour();
  setTimeout(redrawTour, 600); // late layout (fonts, images)
});
