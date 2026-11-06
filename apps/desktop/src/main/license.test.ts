import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRESH_MS, GRACE_MS, LicenseService, maskKey, type LicenseOptions } from './license';

const KEY = 'KINGLET_1C285B2D-6CE6-4BC7-B8BE-ADB6A7E304DA';
const ORG = 'fda84e25-7b55-4d67-916d-60ead04ff61f';
const BENEFIT = '32a8eda4-56cf-4a94-8228-792d324a519e';
const PRODUCT = { organizationId: ORG, benefitId: BENEFIT };
const licenseKey = { organization_id: ORG, benefit_id: BENEFIT, status: 'granted', limit_activations: 3, customer: { email: 'ada@example.com', name: 'Ada Lovelace' } };

type Reply = { status: number; body?: unknown } | 'offline';

/** A fake Polar: answers each call from the list, records what was asked. */
function fakePolar(replies: Partial<Record<'activate' | 'validate' | 'deactivate', Reply[]>>) {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.split('/').pop()!;
    calls.push({ path, body: JSON.parse(String(init.body)) });
    const reply = replies[path as 'activate']?.shift();
    if (!reply || reply === 'offline') throw new TypeError('fetch failed');
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function service(replies: Parameters<typeof fakePolar>[0], extra: Partial<LicenseOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kinglet-license-'));
  const clock = { now: 1_000_000_000_000 };
  const polar = fakePolar(replies);
  const file = join(dir, 'license.json');
  const svc = new LicenseService({ file, product: PRODUCT, instanceName: 'ada@laptop', enforced: true, fetch: polar.fetcher, now: () => clock.now, ...extra });
  return { svc, polar, file, clock };
}

const activated: Reply = { status: 200, body: { id: 'act_1', label: 'ada@laptop', license_key: licenseKey } };
const valid: Reply = { status: 200, body: { ...licenseKey, limit_activations: 5, activation: { id: 'act_1' } } };
const notFound: Reply = { status: 404, body: { error: 'ResourceNotFound', detail: 'Not found' } };

describe('LicenseService (Polar)', () => {
  it('blocks without a key, and lets the development build through', () => {
    expect(service({}).svc.state().status).toBe('none');
    expect(service({}).svc.allowed()).toBe(false);
    const dev = service({}, { enforced: false }).svc;
    expect(dev.state().status).toBe('dev');
    expect(dev.allowed()).toBe(true);
  });

  it('refuses everything until the organization and benefit are configured', async () => {
    const { svc, polar } = service({ activate: [activated] }, { product: { organizationId: null, benefitId: null } });
    expect((await svc.activate(KEY)).status).toBe('unconfigured');
    expect(svc.allowed()).toBe(false);
    expect(polar.calls).toHaveLength(0);
  });

  it('activates a key, stores it for the user only, and opens', async () => {
    const { svc, polar, file } = service({ activate: [activated] });
    const state = await svc.activate(`  ${KEY}\n`);
    expect(state).toMatchObject({ status: 'active', key: maskKey(KEY), email: 'ada@example.com', customer: 'Ada Lovelace', instanceName: 'ada@laptop', activationLimit: 3, error: null });
    expect(svc.allowed()).toBe(true);
    expect(polar.calls[0]).toEqual({ path: 'activate', body: { organization_id: ORG, key: KEY, label: 'ada@laptop' } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(state.key).not.toContain('1C285B2D');
  });

  it('encrypts the key when a keyring exists', async () => {
    const seal = { available: () => true, encrypt: (s: string) => `sealed:${Buffer.from(s).toString('base64')}`, decrypt: (s: string) => Buffer.from(s.slice(7), 'base64').toString() };
    const { svc, file, polar } = service({ activate: [activated], validate: [valid] }, { seal });
    await svc.activate(KEY);
    expect(readFileSync(file, 'utf8')).not.toContain(KEY);
    await svc.validate();
    expect(svc.state().status).toBe('active');
    expect(polar.calls[1]!.body.key).toBe(KEY);
  });

  it('refuses a key of another benefit, and gives its activation back', async () => {
    const other: Reply = { status: 200, body: { id: 'act_9', license_key: { ...licenseKey, benefit_id: 'other' } } };
    const { svc, polar } = service({ activate: [other], deactivate: [{ status: 204 }] });
    const state = await svc.activate(KEY);
    expect(state.status).toBe('none');
    expect(state.error).toMatch(/isn’t a Kinglet key/);
    expect(polar.calls.map((c) => c.path)).toEqual(['activate', 'deactivate']);
    expect(polar.calls[1]!.body).toEqual({ organization_id: ORG, key: KEY, activation_id: 'act_9' });
  });

  it('explains Polar’s refusals', async () => {
    const { svc } = service({
      activate: [
        { status: 403, body: { error: 'NotPermitted', detail: 'License key activation limit already reached' } },
        { status: 403, body: { error: 'NotPermitted', detail: 'License key is no longer active. This license key can not be activated.' } },
        notFound,
        { status: 422, body: { error: 'RequestValidationError', detail: [] } },
        'offline',
      ],
    });
    expect((await svc.activate(KEY)).error).toMatch(/as many computers/);
    expect((await svc.activate(KEY)).error).toMatch(/revoked/);
    expect((await svc.activate(KEY)).error).toMatch(/doesn’t exist/);
    expect((await svc.activate('nope')).error).toMatch(/doesn’t exist/);
    expect((await svc.activate(KEY)).error).toMatch(/No connection/);
    expect(svc.allowed()).toBe(false);
  });

  it('starts without asking when the last check is recent, asks otherwise (scoped to the benefit)', async () => {
    const { svc, polar, clock } = service({ activate: [activated], validate: [valid] });
    await svc.activate(KEY);
    clock.now += FRESH_MS - 1000;
    expect((await svc.startup()).status).toBe('active');
    expect(polar.calls.map((c) => c.path)).toEqual(['activate']);
    clock.now += 2000;
    const state = await svc.startup();
    expect(state).toMatchObject({ status: 'active', validatedAt: clock.now, activationLimit: 5 });
    expect(polar.calls[1]).toEqual({ path: 'validate', body: { organization_id: ORG, key: KEY, activation_id: 'act_1', benefit_id: BENEFIT } });
  });

  it('keeps working offline for 14 days, then blocks', async () => {
    const { svc, clock } = service({ activate: [activated], validate: ['offline', { status: 503 }, 'offline'] });
    await svc.activate(KEY);
    clock.now += 3 * FRESH_MS;
    expect((await svc.validate()).status).toBe('offline');
    expect(svc.allowed()).toBe(true);
    clock.now += GRACE_MS - 4 * FRESH_MS;
    expect((await svc.validate()).status).toBe('offline');
    clock.now += 2 * FRESH_MS;
    const state = await svc.validate();
    expect(state.status).toBe('expired');
    expect(state.error).toMatch(/14 days/);
    expect(svc.allowed()).toBe(false);
  });

  it('a check dated in the future doesn’t count', async () => {
    const { svc, file, clock } = service({ activate: [activated], validate: ['offline'] });
    await svc.activate(KEY);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...stored, validatedAt: clock.now + 365 * FRESH_MS }));
    expect(svc.state().status).toBe('expired');
    expect((await svc.startup()).status).toBe('expired');
  });

  it('blocks and forgets the key when Polar refuses it (refund, revoked, activation removed)', async () => {
    const { svc, file } = service({ activate: [activated, activated], validate: [notFound, { status: 200, body: { ...licenseKey, activation: { id: 'act_other' } } }] });
    await svc.activate(KEY);
    let state = await svc.validate();
    expect(state.status).toBe('invalid');
    expect(state.error).toMatch(/no longer accepts/);
    expect(svc.allowed()).toBe(false);
    expect(() => readFileSync(file)).toThrow();
    await svc.activate(KEY);
    state = await svc.validate();
    expect(state.status).toBe('invalid');
  });

  it('deactivates this computer, also when Polar already forgot it', async () => {
    const { svc, polar } = service({ activate: [activated, activated], deactivate: ['offline', { status: 204 }, notFound] });
    await svc.activate(KEY);
    expect((await svc.deactivate()).ok).toBe(false);
    expect(svc.allowed()).toBe(true);
    expect(await svc.deactivate()).toEqual({ ok: true, error: null });
    expect(svc.state().status).toBe('none');
    await svc.activate(KEY);
    expect((await svc.deactivate()).ok).toBe(true);
    expect(polar.calls.filter((c) => c.path === 'deactivate')).toHaveLength(3);
  });
});
