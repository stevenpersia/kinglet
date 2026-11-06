/**
 * The hero's scripted demos. Each scene is a timeline: the cursor moves to a target (an element with
 * data-target="…" in the app window), clicks, presses a key, and the window's state changes.
 */
export type SceneId = 'inspect' | 'console' | 'devices' | 'phone' | 'share' | 'checks' | 'journeys' | 'deploy';
export type Env = 'local' | 'preview' | 'prod';

export type DemoState = {
  scene: SceneId;
  // Inspector
  inspecting: boolean;
  hover: boolean;
  picked: boolean;
  accent: boolean;
  // Console
  consoleOpen: boolean;
  consoleRow: boolean;
  fixed: boolean;
  // Emulation
  emuMenu: boolean;
  slow: boolean;
  keyboard: boolean;
  tokyo: boolean;
  keyboardFixed: boolean;
  // Environments
  envMenu: boolean;
  deployRow: boolean;
  env: Env;
  // Panels and sections
  checksOpen: boolean;
  section: 'devices' | 'share';
  ogCard: boolean;
  phoneDialog: boolean;
  wifi: boolean;
  phoneLive: boolean;
  // Journeys
  journeysOpen: boolean;
  /** Step the replay has reached (-1: not played). */
  journeyStep: number;
  /** A cookie banner covers the sign-up button on the phone. */
  banner: boolean;
  // Claude
  draft: boolean;
  sent: boolean;
  shown: number;
};

export const initial = (scene: SceneId): DemoState => ({
  scene,
  inspecting: false,
  hover: false,
  picked: false,
  accent: false,
  consoleOpen: false,
  consoleRow: false,
  fixed: false,
  emuMenu: false,
  slow: false,
  keyboard: false,
  tokyo: false,
  keyboardFixed: false,
  envMenu: false,
  deployRow: false,
  env: 'local',
  checksOpen: false,
  section: 'devices',
  ogCard: false,
  phoneDialog: false,
  wifi: false,
  phoneLive: false,
  journeysOpen: false,
  journeyStep: -1,
  banner: false,
  draft: false,
  sent: false,
  shown: 0,
});

export type Line = { k: 'tool' | 'edit' | 'say'; text: string; note?: string; ok?: boolean };
export type Conversation = { prompt: string; note?: string; lines: Line[] };

/** What Kinglet pastes into Claude's input for each scene, and what Claude then does. */
export const CLAUDE: Partial<Record<SceneId, Conversation>> = {
  inspect: {
    prompt: 'Use our mint for this button',
    note: '[Image #1] button.cta · iPhone 16, Laptop',
    lines: [
      { k: 'tool', text: 'kinglet - screenshot', note: 'iphone-16, laptop' },
      { k: 'edit', text: 'Update(components/Hero.tsx)', note: '+2 −2', ok: true },
      { k: 'tool', text: 'kinglet - run_checks', note: 'contrast ✓ 53/53', ok: true },
      { k: 'say', text: 'Done: mint with dark text, checked on both devices.' },
    ],
  },
  console: {
    prompt: 'Fix these console errors',
    note: '3 errors · iPhone 16, Laptop',
    lines: [
      { k: 'tool', text: 'kinglet - get_console', note: '3 errors, 1 failed request' },
      { k: 'edit', text: 'Update(lib/fx.ts)', note: '+5 −2', ok: true },
      { k: 'edit', text: 'Update(components/BudgetCard.tsx)', note: '+2 −1', ok: true },
      { k: 'tool', text: 'kinglet - get_console', note: 'clean', ok: true },
    ],
  },
  devices: {
    prompt: 'The sign-up button hides under the keyboard',
    note: '[Image #1] iPhone 16 · iOS keyboard · Slow 3G',
    lines: [
      { k: 'tool', text: 'kinglet - screenshot', note: 'iphone-16, keyboard ios' },
      { k: 'edit', text: 'Update(components/Signup.tsx)', note: '+9 −2', ok: true },
      { k: 'tool', text: 'kinglet - screenshot', note: 'field above the keyboard ✓', ok: true },
      { k: 'say', text: 'Fixed with visualViewport: the form follows the keyboard.' },
    ],
  },
  share: {
    prompt: 'Fix the Open Graph tags of the home page',
    note: '2 tags to add · Next.js · app/layout.tsx',
    lines: [
      { k: 'tool', text: 'kinglet - get_share_preview', note: '3 platforms need a look' },
      { k: 'edit', text: 'Update(app/layout.tsx)', note: '+6', ok: true },
      { k: 'edit', text: 'Write(app/opengraph-image.tsx)', note: '1200×630', ok: true },
      { k: 'tool', text: 'kinglet - get_share_preview', note: '10/10 platforms', ok: true },
    ],
  },
  checks: {
    prompt: 'Fix the failing checks',
    note: 'Tap targets · Meta Pixel before consent',
    lines: [
      { k: 'tool', text: 'kinglet - run_checks', note: '51/53' },
      { k: 'edit', text: 'Update(components/Nav.tsx)', note: '+3 −3', ok: true },
      { k: 'edit', text: 'Update(app/consent.tsx)', note: 'pixel after “Accept” · +7 −2', ok: true },
      { k: 'tool', text: 'kinglet - run_checks', note: '53/53', ok: true },
    ],
  },
  journeys: {
    prompt: 'Fix the “Sign up” journey',
    note: 'iPhone 16 · step 3 · covered by div.cookie-banner',
    lines: [
      { k: 'tool', text: 'kinglet - screenshot', note: 'iphone-16 · banner over the button' },
      { k: 'edit', text: 'Update(components/CookieBanner.tsx)', note: '+6 −3', ok: true },
      { k: 'tool', text: 'Journey “Sign up” played again', note: 'iPhone 16 ✓ · Laptop ✓', ok: true },
      { k: 'say', text: 'The banner no longer covers the form: the journey passes on both devices.' },
    ],
  },
  deploy: {
    prompt: 'Commit and push the budgets feature',
    lines: [
      { k: 'tool', text: 'Bash(git push origin feat/budgets)' },
      { k: 'tool', text: 'kinglet - list_deployments', note: 'Ready · PR #128 ✓ CI', ok: true },
      { k: 'tool', text: 'kinglet - run_checks', note: 'preview · 53/53', ok: true },
    ],
  },
};

export type Step = { at: number; to?: string; click?: boolean; key?: string; set?: Partial<DemoState> };

/** Claude's lines appear one after the other once the prompt is sent. */
function stream(scene: SceneId, at: number, every = 650, done?: Partial<DemoState>): Step[] {
  const n = CLAUDE[scene]?.lines.length ?? 0;
  const steps: Step[] = Array.from({ length: n }, (_, i) => ({ at: at + (i + 1) * every, set: { shown: i + 1 } }));
  if (done) steps.push({ at: at + n * every + 300, set: done });
  return steps;
}

/** Click "Ask Claude"-like button, then into Claude's input, then Enter. */
function ask(scene: SceneId, button: string, at: number, done?: Partial<DemoState>): Step[] {
  return [
    { at, to: button },
    { at: at + 700, click: true, set: { draft: true } },
    { at: at + 1500, to: 'claude-input' },
    { at: at + 2200, click: true },
    { at: at + 2700, key: 'Enter', set: { sent: true } },
    ...stream(scene, at + 2700, 650, done),
  ];
}

export const SCRIPTS: Record<SceneId, Step[]> = {
  inspect: [
    { at: 300, to: 'btn-inspect' },
    { at: 1100, click: true, set: { inspecting: true } },
    { at: 1700, to: 'cta-phone', set: { hover: true } },
    { at: 2700, to: 'cta-laptop' },
    { at: 3500, click: true, set: { picked: true } },
    ...ask('inspect', 'ask-inspect', 4300, { accent: true }),
  ],
  console: [
    { at: 300, to: 'btn-console' },
    { at: 1100, click: true, set: { consoleOpen: true } },
    { at: 1800, to: 'console-row', set: { consoleRow: true } },
    ...ask('console', 'send-console', 2900, { fixed: true }),
  ],
  devices: [
    { at: 300, to: 'btn-emu' },
    { at: 1000, click: true, set: { emuMenu: true } },
    { at: 1600, to: 'emu-slow' },
    { at: 2200, click: true, set: { slow: true } },
    { at: 2700, to: 'emu-ios' },
    { at: 3300, click: true, set: { keyboard: true } },
    { at: 3800, to: 'emu-tokyo' },
    { at: 4400, click: true, set: { tokyo: true } },
    { at: 5000, to: 'btn-emu' },
    { at: 5600, click: true, set: { emuMenu: false } },
    ...ask('devices', 'claude-input', 6100, { keyboardFixed: true }),
  ],
  phone: [
    { at: 300, to: 'btn-phone' },
    { at: 1000, click: true, set: { phoneDialog: true } },
    { at: 1700, to: 'wifi-toggle' },
    { at: 2400, click: true, set: { wifi: true } },
    { at: 3500, set: { phoneLive: true } },
    { at: 4500, to: 'stage' },
    { at: 5100, click: true, set: { phoneDialog: false } },
    // A saved file: hot reload reaches the real phone too.
    { at: 6300, set: { accent: true } },
  ],
  share: [
    { at: 300, to: 'rail-og' },
    { at: 1000, click: true, set: { section: 'share' } },
    { at: 1900, to: 'og-whatsapp', set: { ogCard: true } },
    { at: 2900, to: 'og-linkedin' },
    ...ask('share', 'ask-og', 3900, { fixed: true }),
  ],
  checks: [
    { at: 300, to: 'rail-checks' },
    { at: 1000, click: true, set: { checksOpen: true } },
    ...ask('checks', 'ask-checks', 2000, { fixed: true }),
  ],
  journeys: [
    { at: 0, set: { banner: true } },
    { at: 300, to: 'tab-journeys' },
    { at: 1000, click: true, set: { journeysOpen: true } },
    { at: 1700, to: 'journey-play' },
    { at: 2300, click: true, set: { journeyStep: 0 } },
    { at: 2800, set: { journeyStep: 1 } },
    { at: 3300, set: { journeyStep: 2 } },
    { at: 3800, set: { journeyStep: 3 } },
    { at: 4300, set: { journeyStep: 4 } },
    ...ask('journeys', 'ask-journey', 5000, { fixed: true, banner: false }),
  ],
  deploy: [
    { at: 300, to: 'claude-input' },
    { at: 1000, click: true, set: { draft: true } },
    { at: 1800, key: 'Enter', set: { sent: true } },
    ...stream('deploy', 1800, 650),
    { at: 4300, to: 'env-preview' },
    { at: 5000, click: true, set: { envMenu: true } },
    { at: 5600, to: 'deploy-row', set: { deployRow: true } },
    { at: 6300, click: true, set: { envMenu: false, env: 'preview' } },
    { at: 7300, to: 'env-prod' },
    { at: 8000, click: true, set: { env: 'prod' } },
  ],
};

/** How long a scene lasts, with a pause on its final state. */
export const duration = (id: SceneId) => Math.max(...SCRIPTS[id].map((s) => s.at)) + 2600;

/** The end state of a scene, for reduced motion. */
export const finalState = (id: SceneId): DemoState => SCRIPTS[id].reduce<DemoState>((s, step) => ({ ...s, ...step.set }), initial(id));
