import { t } from './i18n.ts';

/**
 * Journeys: a path through the site recorded once (clicks, typing, navigation) and played again
 * on every device, after each Claude task or deploy, or exported as a Playwright test.
 */

/** What finds the element again: a CSS selector, and the visible text when it has one (links, buttons). */
export interface StepTarget {
  selector: string;
  /** Tag name, lower case. */
  tag: string;
  /** Visible text or accessible name, whitespace collapsed (may be empty). */
  text: string;
  /** ARIA role the element plays, when it is a common one (button, link, checkbox…). */
  role?: string;
  /** The field's label, for form steps. */
  label?: string;
}

export type JourneyStep =
  | { kind: 'goto'; path: string }
  | ({ kind: 'click' } & StepTarget)
  | ({ kind: 'fill'; value: string; secret?: boolean } & StepTarget)
  | ({ kind: 'select'; value: string; option?: string } & StepTarget)
  | ({ kind: 'check'; checked: boolean } & StepTarget)
  | { kind: 'press'; key: 'Enter' | 'Escape' }
  /** Where the previous step led: checked on replay (the path, query included, without the origin). */
  | { kind: 'expect-url'; path: string };

export interface Journey {
  id: string;
  name: string;
  /** Path the journey starts from (on whatever origin it is replayed). */
  startPath: string;
  steps: JourneyStep[];
  createdAt: number;
  /** Played again after each finished Claude task, commit and deploy. */
  auto?: boolean;
}

export interface JourneyStepResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface JourneyDeviceRun {
  deviceId: string;
  label: string;
  ok: boolean;
  /** One per step played (the run stops at the first failure). */
  steps: JourneyStepResult[];
  /** Index of the failing step, null when everything passed. */
  failedAt: number | null;
  error: string | null;
  /** The device when it failed (data URL), kept in memory only. */
  screenshot?: string | null;
  consoleErrors: string[];
  ms: number;
}

export type JourneyTrigger = 'manual' | 'claude' | 'commit' | 'deploy';

export interface JourneyRun {
  journeyId: string;
  at: number;
  trigger: JourneyTrigger;
  /** Origin it was played on (local dev server, preview, production). */
  origin: string;
  ok: boolean;
  devices: JourneyDeviceRun[];
}

/** Path + query of a URL (what a journey keeps: it can be replayed on another origin). */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

const sameTarget = (a: JourneyStep, b: JourneyStep) => 'selector' in a && 'selector' in b && a.selector === b.selector;

/**
 * Adds a recorded step, keeping the journey short: typing in a field again keeps the last value,
 * a click that only put the focus in a field before typing is dropped, a URL already expected is not repeated.
 */
export function appendStep(steps: JourneyStep[], step: JourneyStep): JourneyStep[] {
  const last = steps[steps.length - 1];
  if (!last) return step.kind === 'expect-url' ? steps : [step];
  if (step.kind === 'fill' && last.kind === 'fill' && sameTarget(last, step)) return [...steps.slice(0, -1), step];
  if ((step.kind === 'fill' || step.kind === 'select') && last.kind === 'click' && sameTarget(last, step)) return [...steps.slice(0, -1), step];
  // A click on a checkbox (or its label) already says it: keep the check, not the click.
  if (step.kind === 'check' && last.kind === 'click' && (sameTarget(last, step) || last.tag === 'label')) return [...steps.slice(0, -1), step];
  if (step.kind === 'click' && last.kind === 'check' && sameTarget(last, step)) return steps;
  if (step.kind === 'expect-url') {
    const lastUrl = [...steps].reverse().find((s) => s.kind === 'expect-url' || s.kind === 'goto') as { path: string } | undefined;
    if (lastUrl?.path === step.path) return steps;
    if (last.kind === 'expect-url') return [...steps.slice(0, -1), step];
  }
  if (step.kind === 'goto' && last.kind === 'goto') return [...steps.slice(0, -1), step];
  return [...steps, step];
}

const short = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const name = (s: StepTarget) => (s.label || s.text ? `« ${short(s.label || s.text)} »` : s.tag);
const nameEn = (s: StepTarget) => (s.label || s.text ? `“${short(s.label || s.text)}”` : s.tag);

/** One line per step, for the panel and for Claude. */
export function describeStep(step: JourneyStep): string {
  switch (step.kind) {
    case 'goto':
      return t(`Open ${step.path}`, `Ouvrir ${step.path}`);
    case 'click':
      return t(`Click ${nameEn(step)}`, `Clic sur ${name(step)}`);
    case 'fill': {
      const v = step.secret ? '••••••' : `“${short(step.value, 24)}”`;
      const vf = step.secret ? '••••••' : `« ${short(step.value, 24)} »`;
      return step.value ? t(`Type ${v} in ${nameEn(step)}`, `Saisir ${vf} dans ${name(step)}`) : t(`Empty ${nameEn(step)}`, `Vider ${name(step)}`);
    }
    case 'select':
      return t(`Choose “${short(step.option || step.value, 24)}” in ${nameEn(step)}`, `Choisir « ${short(step.option || step.value, 24)} » dans ${name(step)}`);
    case 'check':
      return step.checked ? t(`Check ${nameEn(step)}`, `Cocher ${name(step)}`) : t(`Uncheck ${nameEn(step)}`, `Décocher ${name(step)}`);
    case 'press':
      return step.key === 'Enter' ? t('Press Enter', 'Touche Entrée') : t('Press Escape', 'Touche Échap');
    case 'expect-url':
      return t(`Arrive on ${step.path}`, `Arriver sur ${step.path}`);
  }
}

/** The run, for Claude: what broke, where, on which devices. */
export function journeyPrompt(journey: Journey, run: JourneyRun): string {
  const lines = [`Journey “${journey.name}” on ${run.origin}, starting at ${journey.startPath}:`];
  journey.steps.forEach((s, i) => lines.push(`${i + 1}. ${describeStepEn(s)}`));
  lines.push('');
  for (const d of run.devices) {
    if (d.ok) lines.push(`- ${d.label}: passed`);
    else lines.push(`- ${d.label}: failed at step ${(d.failedAt ?? 0) + 1}${d.error ? ` (${d.error})` : ''}${d.consoleErrors.length ? `; console: ${d.consoleErrors.slice(0, 3).join(' | ')}` : ''}`);
  }
  return lines.join('\n');
}

/** English labels whatever the app's language: prompts are read by Claude. */
function describeStepEn(step: JourneyStep): string {
  switch (step.kind) {
    case 'goto':
      return `Open ${step.path}`;
    case 'click':
      return `Click ${nameEn(step)} (${step.selector})`;
    case 'fill':
      return `Type ${step.secret ? 'the password' : `“${step.value}”`} in ${nameEn(step)} (${step.selector})`;
    case 'select':
      return `Choose “${step.option || step.value}” in ${nameEn(step)} (${step.selector})`;
    case 'check':
      return `${step.checked ? 'Check' : 'Uncheck'} ${nameEn(step)} (${step.selector})`;
    case 'press':
      return `Press ${step.key}`;
    case 'expect-url':
      return `Expect to arrive on ${step.path}`;
  }
}

/* ------------------------------------------------------------------ */
/* Playwright export                                                   */
/* ------------------------------------------------------------------ */

export interface PlaywrightDevice {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Selectors Kinglet builds by position (div:nth-of-type(3) > …) break easily: the text is better. */
const positional = (selector: string) => /:nth-of-type|>/.test(selector) && !/^#|\[(data-testid|data-test|name|id|aria-label)/.test(selector);

const ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'switch', 'textbox', 'combobox']);

function locator(s: StepTarget): string {
  if (positional(s.selector)) {
    if (s.role && ROLES.has(s.role) && s.text) return `page.getByRole(${q(s.role)}, { name: ${q(s.text)}, exact: true })`;
    if (s.label) return `page.getByLabel(${q(s.label)}, { exact: true })`;
    if (s.text) return `page.locator(${q(s.tag)}, { hasText: ${q(s.text)} }).first()`;
  }
  return `page.locator(${q(s.selector)}).first()`;
}

function stepCode(step: JourneyStep): string[] {
  switch (step.kind) {
    case 'goto':
      return [`await page.goto(BASE_URL + ${q(step.path)});`];
    case 'click':
      return [`await ${locator(step)}.click();`];
    case 'fill':
      return step.secret
        ? [`// A password: set JOURNEY_PASSWORD rather than keeping it in the test.`, `await ${locator(step)}.fill(process.env.JOURNEY_PASSWORD ?? ${q(step.value)});`]
        : [`await ${locator(step)}.fill(${q(step.value)});`];
    case 'select':
      return [`await ${locator(step)}.selectOption(${q(step.value)});`];
    case 'check':
      return [`await ${locator(step)}.setChecked(${step.checked});`];
    case 'press':
      return [`await page.keyboard.press(${q(step.key)});`];
    case 'expect-url': {
      const path = step.path.split('#')[0]!;
      return [`await expect(page).toHaveURL(new RegExp(${q(`^[^?#]*${escapeRegExp(path)}`)}${path.includes('?') ? '' : ` + '([?#]|$)'`}));`];
    }
  }
}

/** A Playwright test that plays the journey on each device (one describe per device). */
export function journeyToPlaywright(journey: Journey, opts: { baseUrl: string; devices: PlaywrightDevice[] }): string {
  const devices = opts.devices.map(
    (d) =>
      `  { name: ${q(d.name)}, viewport: { width: ${d.width}, height: ${d.height} }, deviceScaleFactor: ${d.deviceScaleFactor}, isMobile: ${d.isMobile}, hasTouch: ${d.hasTouch}${d.userAgent ? `, userAgent: ${q(d.userAgent)}` : ''} },`,
  );
  const body = [`await page.goto(BASE_URL + ${q(journey.startPath)});`, ...journey.steps.flatMap(stepCode)];
  return [
    `// Journey “${journey.name.replace(/\n/g, ' ')}”, recorded in Kinglet.`,
    `// Run it with: npx playwright test (BASE_URL=https://… to play it on a preview or in production).`,
    `import { test, expect } from '@playwright/test';`,
    '',
    `const BASE_URL = process.env.BASE_URL ?? ${q(opts.baseUrl.replace(/\/$/, ''))};`,
    '',
    'const DEVICES = [',
    ...devices,
    '];',
    '',
    'for (const device of DEVICES) {',
    '  test.describe(device.name, () => {',
    '    test.use({ viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor, isMobile: device.isMobile, hasTouch: device.hasTouch, ...(device.userAgent ? { userAgent: device.userAgent } : {}) });',
    '',
    `    test(${q(journey.name)}, async ({ page }) => {`,
    ...body.map((l) => `      ${l}`),
    '    });',
    '  });',
    '}',
    '',
  ].join('\n');
}

/** A file name for the exported test. */
export function journeyFileName(journey: Journey): string {
  const slug = journey.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'journey'}.spec.ts`;
}
