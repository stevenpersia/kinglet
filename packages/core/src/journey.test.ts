import { describe, expect, it } from 'vitest';
import { appendStep, describeStep, journeyFileName, journeyPrompt, journeyToPlaywright, setLanguage, type Journey, type JourneyStep } from './index.ts';

const email = { selector: '#email', tag: 'input', text: '', label: 'E-mail' };
const link = { selector: 'body > header > nav > a:nth-of-type(2)', tag: 'a', text: 'Atelier', role: 'link' };

const record = (steps: JourneyStep[]) => steps.reduce<JourneyStep[]>((acc, s) => appendStep(acc, s), []);

describe('recording', () => {
  it('keeps the journey short', () => {
    const steps = record([
      { kind: 'expect-url', path: '/' },
      { kind: 'click', ...link },
      { kind: 'expect-url', path: '/atelier.html' },
      { kind: 'expect-url', path: '/atelier.html' },
      { kind: 'click', ...email },
      { kind: 'fill', ...email, value: 'c' },
      { kind: 'fill', ...email, value: 'camille@atelier.fr' },
      { kind: 'click', selector: 'label:nth-of-type(1)', tag: 'label', text: 'J’accepte' },
      { kind: 'check', selector: '#ok', tag: 'input', text: '', label: 'J’accepte', checked: true },
      { kind: 'click', selector: '#ok', tag: 'input', text: '', label: 'J’accepte' },
      { kind: 'press', key: 'Enter' },
      { kind: 'expect-url', path: '/merci' },
    ]);
    expect(steps.map((s) => s.kind)).toEqual(['click', 'expect-url', 'fill', 'check', 'press', 'expect-url']);
    expect(steps[2]).toMatchObject({ value: 'camille@atelier.fr' });
  });

  it('describes each step, passwords hidden', () => {
    expect(describeStep({ kind: 'click', ...link })).toBe('Click “Atelier”');
    expect(describeStep({ kind: 'fill', ...email, value: 'secret', secret: true })).toBe('Type •••••• in “E-mail”');
    setLanguage('fr');
    try {
      expect(describeStep({ kind: 'fill', ...email, value: 'camille@atelier.fr' })).toBe('Saisir « camille@atelier.fr » dans « E-mail »');
      expect(describeStep({ kind: 'expect-url', path: '/merci' })).toBe('Arriver sur /merci');
    } finally {
      setLanguage('en');
    }
  });
});

const journey: Journey = {
  id: 'j1',
  name: 'Contact form',
  startPath: '/',
  createdAt: 0,
  steps: [
    { kind: 'click', ...link },
    { kind: 'expect-url', path: '/atelier.html' },
    { kind: 'fill', ...email, value: "l'atelier" },
    { kind: 'fill', selector: 'input[name="password"]', tag: 'input', text: '', label: 'Mot de passe', value: 'hunter2', secret: true },
    { kind: 'select', selector: '#pays', tag: 'select', text: '', label: 'Pays', value: 'fr', option: 'France' },
    { kind: 'check', selector: 'form > label:nth-of-type(2) > input', tag: 'input', text: '', label: 'J’accepte', role: 'checkbox', checked: true },
    { kind: 'press', key: 'Enter' },
  ],
};

describe('Playwright export', () => {
  it('writes a test per device, with readable locators', () => {
    const code = journeyToPlaywright(journey, { baseUrl: 'http://localhost:5173/', devices: [{ name: 'iPhone 16', width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true }] });
    expect(code).toContain("const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';");
    expect(code).toContain("{ name: 'iPhone 16', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },");
    expect(code).toContain("await page.goto(BASE_URL + '/');");
    expect(code).toContain("await page.getByRole('link', { name: 'Atelier', exact: true }).click();");
    expect(code).toContain("await expect(page).toHaveURL(new RegExp('^[^?#]*\\\\/atelier\\\\.html' + '([?#]|$)'));");
    expect(code).toContain("await page.locator('#email').first().fill('l\\'atelier');");
    expect(code).toContain("fill(process.env.JOURNEY_PASSWORD ?? 'hunter2');");
    expect(code).toContain("await page.locator('#pays').first().selectOption('fr');");
    expect(code).toContain("await page.getByLabel('J’accepte', { exact: true }).setChecked(true);");
    expect(code).toContain("await page.keyboard.press('Enter');");
    expect(journeyFileName({ ...journey, name: 'Réserver une table' })).toBe('reserver-une-table.spec.ts');
  });

  it('tells Claude where it broke', () => {
    const p = journeyPrompt(journey, {
      journeyId: 'j1',
      at: 0,
      trigger: 'claude',
      origin: 'http://localhost:5173',
      ok: false,
      devices: [
        { deviceId: 'a', label: 'iPhone 16', ok: false, steps: [], failedAt: 2, error: 'Element not found: #email', consoleErrors: ['TypeError: x'], ms: 900 },
        { deviceId: 'b', label: 'Laptop', ok: true, steps: [], failedAt: null, error: null, consoleErrors: [], ms: 800 },
      ],
    });
    expect(p).toContain('3. Type “l\'atelier” in “E-mail” (#email)');
    expect(p).toContain('- iPhone 16: failed at step 3 (Element not found: #email); console: TypeError: x');
    expect(p).toContain('- Laptop: passed');
  });
});
