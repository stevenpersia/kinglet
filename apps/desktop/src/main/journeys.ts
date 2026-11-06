import type { WebContents } from 'electron';
import { pathOf, t, type Journey, type JourneyDeviceRun, type JourneyStep, type StepTarget } from '@kinglet/core';

/**
 * Plays a recorded journey in one page (a device on screen, or one rendered off screen).
 * Clicks and keys go through the DevTools protocol, like a person's: an element covered by a
 * banner fails the way it would for a visitor. Typing uses the browser's own text input, so
 * React, Vue and Svelte see it.
 */

/** Isolated world: the page's scripts don't see Kinglet's. */
const WORLD = 1002;
const FIND_MS = 6000;
const NAV_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const within = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);

/** Finds the element (selector first, else its text), scrolls it into view, says where it is and what covers it. */
const FIND = (target: StepTarget, action: string, extra: unknown = null) => `(async () => {
  const target = ${JSON.stringify(target)};
  const action = ${JSON.stringify(action)};
  const extra = ${JSON.stringify(extra)};
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const textOf = (el) => norm(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 80);
  const find = () => {
    let list = [];
    try { list = [...document.querySelectorAll(target.selector)]; } catch {}
    const shown = list.filter(visible);
    // Several matches: the one with the recorded text.
    const exact = target.text ? shown.find((e) => textOf(e) === target.text) : null;
    if (exact || shown.length) return exact || shown[0];
    if (target.text) {
      const same = [...document.querySelectorAll(target.tag)].filter((e) => visible(e) && textOf(e) === target.text);
      if (same.length) return same[0];
    }
    return null;
  };
  const until = Date.now() + ${FIND_MS};
  let el = find();
  while (!el && Date.now() < until) { await new Promise((r) => setTimeout(r, 120)); el = find(); }
  if (!el) return { error: 'not-found' };
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  if (el.disabled) return { error: 'disabled' };
  const r = el.getBoundingClientRect();
  const x = r.left + Math.min(r.width / 2, Math.max(r.width - 2, 1)), y = r.top + Math.min(r.height / 2, Math.max(r.height - 2, 1));
  // Like a finger: what is really under that point?
  const top = document.elementFromPoint(x, y);
  const ok = top && (top === el || el.contains(top) || top.contains(el) || (top.tagName === 'LABEL' && top.control === el) || (el.labels && [...el.labels].includes(top)));
  const describe = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const out = { x, y, covered: ok || !top ? null : describe(top) };
  if (action === 'focus' || action === 'fill') {
    el.focus();
    if (typeof el.select === 'function' && action === 'fill') { try { el.select(); } catch {} }
  }
  if (action === 'select') {
    const proto = HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, extra);
    if (el.value !== extra) return { error: 'option', options: [...el.options].map((o) => o.value).slice(0, 8) };
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (action === 'checked') out.checked = !!el.checked;
  if (action === 'value') out.value = el.value;
  if (action === 'set') {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, extra);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (action === 'commit') el.dispatchEvent(new Event('change', { bubbles: true }));
  if (action === 'click-js') el.click();
  return out;
})()`;

type Found = { x: number; y: number; covered: string | null; checked?: boolean; value?: string; error?: string; options?: string[] };

const KEYS = { Enter: { code: 'Enter', vk: 13, text: '\r' }, Escape: { code: 'Escape', vk: 27, text: '' } } as const;

/** Where the page is, path + query, trailing slash and hash aside (for comparing). */
const norm = (p: string) => {
  const [path = '/', query = ''] = p.split('#')[0]!.split('?');
  return `${path.replace(/\/+$/, '') || '/'}${query ? `?${query}` : ''}`;
};

export class JourneyPlayer {
  /** `scale`: how much bigger the device is drawn than its CSS pixels (the zoom of the device views). */
  constructor(
    private wc: WebContents,
    private scale = 1,
  ) {}

  /** Input through the DevTools protocol; it waits for a frame, which a hidden page never paints. */
  private async input(method: string, params: object) {
    await within(this.wc.debugger.sendCommand(method, params), 2000, 'input');
  }

  private get dbg() {
    return this.wc.debugger.isAttached() ? this.wc.debugger : null;
  }

  private async find(target: StepTarget, action: string, extra: unknown = null): Promise<Found> {
    const r = (await within(this.wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: FIND(target, action, extra) }]), FIND_MS + 4000, t('the page did not answer', 'la page ne répond pas'))) as Found;
    if (r.error === 'not-found') throw new Error(t(`Not found: ${target.text ? `“${target.text}” ` : ''}(${target.selector})`, `Introuvable : ${target.text ? `« ${target.text} » ` : ''}(${target.selector})`));
    if (r.error === 'disabled') throw new Error(t(`Disabled: ${target.selector}`, `Désactivé : ${target.selector}`));
    if (r.error === 'option') throw new Error(t(`No such option (${r.options?.join(', ')})`, `Option absente (${r.options?.join(', ')})`));
    return r;
  }

  /** A real click (mouse, or a tap on touch devices), at the middle of the element. */
  private async click(target: StepTarget) {
    const at = await this.find(target, 'focus');
    if (at.covered) throw new Error(t(`Covered by ${at.covered}: it gets the click instead of ${target.text ? `“${target.text}”` : target.selector}`, `Recouvert par ${at.covered} : il reçoit le clic à la place de ${target.text ? `« ${target.text} »` : target.selector}`));
    // Real input, in the view's pixels (the emulation maps them back, and turns them into taps on touch devices).
    const x = Math.round(at.x * this.scale);
    const y = Math.round(at.y * this.scale);
    this.wc.sendInputEvent({ type: 'mouseMove', x, y });
    this.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  private async key(key: keyof typeof KEYS) {
    const k = KEYS[key];
    const dbg = this.dbg;
    if (!dbg) {
      await this.wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))` }]);
      return;
    }
    await this.input('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
    if (k.text) await this.input('Input.dispatchKeyEvent', { type: 'char', key, code: k.code, text: k.text, unmodifiedText: k.text, windowsVirtualKeyCode: k.vk });
    await this.input('Input.dispatchKeyEvent', { type: 'keyUp', key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
  }

  private async fill(step: Extract<JourneyStep, { kind: 'fill' }>) {
    // Empty first: select() does nothing on e-mail and number fields, typed text would be added.
    await this.find(step, 'set', '');
    await this.find(step, 'fill');
    let typed = false;
    if (step.value) typed = await within(this.wc.insertText(step.value), 2000, 'insertText').then(() => true, () => false);
    if (!typed) await this.find(step, 'set', step.value);
    const now = await this.find(step, 'value');
    // A field that formats as you type (phone, card) may differ: only an empty result is wrong.
    if (step.value && !now.value) throw new Error(t('The field stayed empty', 'Le champ est resté vide'));
    await this.find(step, 'commit');
  }

  /** Loads a page and waits for it (and for client-side rendering to settle a little). */
  async load(url: string) {
    await within(this.wc.loadURL(url), NAV_MS, t(`timed out loading ${url}`, `délai dépassé au chargement de ${url}`)).catch((e: Error) => {
      // ERR_ABORTED: a redirect or a client-side navigation took over; the page is there.
      if (!/ERR_ABORTED/.test(e.message)) throw e;
    });
    await sleep(250);
  }

  /** After a step: let a navigation start, then wait for it to finish. */
  private async settle() {
    await sleep(200);
    const until = Date.now() + NAV_MS;
    while (this.wc.isLoading() && Date.now() < until) await sleep(100);
    await sleep(150);
  }

  async step(step: JourneyStep, origin: string) {
    switch (step.kind) {
      case 'goto':
        return this.load(new URL(step.path, origin).toString());
      case 'click':
        await this.click(step);
        return this.settle();
      case 'fill':
        await this.fill(step);
        return this.settle();
      case 'select':
        await this.find(step, 'select', step.value);
        return this.settle();
      case 'check': {
        const now = await this.find(step, 'checked');
        if (now.checked !== step.checked) await this.click(step);
        const after = await this.find(step, 'checked');
        if (after.checked !== step.checked) throw new Error(t('The box did not change', 'La case n’a pas changé'));
        return this.settle();
      }
      case 'press':
        await this.key(step.key);
        return this.settle();
      case 'expect-url': {
        const want = norm(step.path);
        const until = Date.now() + NAV_MS;
        while (Date.now() < until) {
          if (norm(pathOf(this.wc.getURL())) === want) return;
          await sleep(150);
        }
        throw new Error(t(`Still on ${pathOf(this.wc.getURL())}, expected ${step.path}`, `Toujours sur ${pathOf(this.wc.getURL())}, attendu ${step.path}`));
      }
    }
  }

  /** The whole journey; stops at the first step that fails, with a capture of that moment. */
  async play(journey: Journey, origin: string, device: { id: string; label: string }, onStep?: (index: number) => void): Promise<JourneyDeviceRun> {
    const started = Date.now();
    const consoleErrors: string[] = [];
    const onConsole = (e: unknown) => {
      const { level, message } = e as { level: string; message: string };
      if (level === 'error' && consoleErrors.length < 20) consoleErrors.push(message);
    };
    this.wc.on('console-message', onConsole);
    const steps: JourneyDeviceRun['steps'] = [];
    const done = (failedAt: number | null, error: string | null, screenshot: string | null = null): JourneyDeviceRun => ({
      deviceId: device.id,
      label: device.label,
      ok: failedAt === null,
      steps,
      failedAt,
      error,
      screenshot,
      consoleErrors,
      ms: Date.now() - started,
    });
    try {
      try {
        await this.load(new URL(journey.startPath, origin).toString());
      } catch (e) {
        return done(-1, (e as Error).message);
      }
      for (const [i, step] of journey.steps.entries()) {
        onStep?.(i);
        const t0 = Date.now();
        try {
          await this.step(step, origin);
          steps.push({ ok: true, ms: Date.now() - t0 });
        } catch (e) {
          const error = (e as Error).message;
          steps.push({ ok: false, ms: Date.now() - t0, error });
          const shot = await this.wc
            .capturePage()
            .then((img) => (img.isEmpty() ? null : img.resize({ width: Math.min(420, img.getSize().width) }).toDataURL()))
            .catch(() => null);
          return done(i, error, shot);
        }
      }
      return done(null, null);
    } finally {
      this.wc.off('console-message', onConsole);
    }
  }
}
