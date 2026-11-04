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
    box.setAttribute('data-parakeet-inspector', '');
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
  if (!el || el === hovered || (el as HTMLElement).hasAttribute?.('data-parakeet-inspector')) return;
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
