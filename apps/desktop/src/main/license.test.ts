import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRESH_MS, GRACE_MS, LicenseService, maskKey, type LicenseOptions } from './license';

const KEY = 'AAAA-BBBB-CCCC-DDDD-38E1F2A7';
const PRODUCT = { storeId: 11, productId: 22 };
const meta = { store_id: 11, product_id: 22, customer_name: 'Ada', customer_email: 'ada@example.com' };
const lk = { status: 'active', activation_limit: 3, activation_usage: 1 };

type Reply = { status: number; body: unknown } | 'offline';

/** A fake Lemon Squeezy: answers each call from the list, records what was asked. */
function fakeLs(replies: Partial<Record<'activate' | 'validate' | 'deactivate', Reply[]>>) {
  const calls: { path: string; params: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.split('/').pop()!;
    calls.push({ path, params: Object.fromEntries(new URLSearchParams(String(init.body))) });
    const reply = replies[path as 'activate']?.shift();
    if (!reply || reply === 'offline') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function service(replies: Parameters<typeof fakeLs>[0], extra: Partial<LicenseOptions> & { clock?: { now: number } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kinglet-license-'));
  const clock = extra.clock ?? { now: 1_000_000_000_000 };
  const ls = fakeLs(replies);
  const file = join(dir, 'license.json');
  const svc = new LicenseService({ file, product: PRODUCT, instanceName: 'ada@laptop', enforced: true, fetch: ls.fetcher, now: () => clock.now, ...extra });
  return { svc, ls, file, clock };
}

const activated = { status: 200, body: { activated: true, error: null, license_key: lk, instance: { id: 'inst_1', name: 'ada@laptop' }, meta } };
const valid = { status: 200, body: { valid: true, error: null, license_key: { ...lk, activation_usage: 2 }, instance: { id: 'inst_1' }, meta } };

describe('LicenseService', () => {
  it('blocks without a key, and lets the development build through', () => {
    expect(service({}).svc.state().status).toBe('none');
    expect(service({}).svc.allowed()).toBe(false);
    const dev = service({}, { enforced: false }).svc;
    expect(dev.state().status).toBe('dev');
    expect(dev.allowed()).toBe(true);
  });

  it('refuses everything until the store and product are configured', async () => {
    const { svc, ls } = service({ activate: [activated] }, { product: { storeId: null, productId: null } });
    expect((await svc.activate(KEY)).status).toBe('unconfigured');
    expect(svc.allowed()).toBe(false);
    expect(ls.calls).toHaveLength(0);
  });

  it('activates a key, stores it for the user only, and opens', async () => {
    const { svc, ls, file } = service({ activate: [activated] });
    const state = await svc.activate(`  ${KEY}\n`);
    expect(state).toMatchObject({ status: 'active', key: maskKey(KEY), email: 'ada@example.com', customer: 'Ada', instanceName: 'ada@laptop', activations: { used: 1, limit: 3 }, error: null });
    expect(svc.allowed()).toBe(true);
    expect(ls.calls[0]).toEqual({ path: 'activate', params: { license_key: KEY, instance_name: 'ada@laptop' } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(state.key).not.toContain('AAAA');
  });

  it('encrypts the key when a keyring exists', async () => {
    const seal = { available: () => true, encrypt: (s: string) => `sealed:${Buffer.from(s).toString('base64')}`, decrypt: (s: string) => Buffer.from(s.slice(7), 'base64').toString() };
    const { svc, file } = service({ activate: [activated], validate: [valid] }, { seal });
    await svc.activate(KEY);
    expect(readFileSync(file, 'utf8')).not.toContain(KEY);
    await svc.validate();
    expect(svc.state().status).toBe('active');
  });

  it('refuses a key from another store or product, and gives its activation back', async () => {
    const other = { ...activated, body: { ...activated.body, meta: { ...meta, product_id: 99 } } };
    const { svc, ls } = service({ activate: [other], deactivate: [{ status: 200, body: { deactivated: true } }] });
    const state = await svc.activate(KEY);
    expect(state.status).toBe('none');
    expect(state.error).toMatch(/Kinglet/);
    expect(ls.calls.map((c) => c.path)).toEqual(['activate', 'deactivate']);
    expect(ls.calls[1]!.params).toEqual({ license_key: KEY, instance_id: 'inst_1' });
  });

  it('explains Lemon Squeezy’s refusals', async () => {
    const { svc } = service({
      activate: [
        { status: 400, body: { activated: false, error: 'This license key has reached the activation limit.' } },
        { status: 404, body: { activated: false, error: 'license_key not found.' } },
        'offline',
      ],
    });
    expect((await svc.activate(KEY)).error).toMatch(/as many computers/);
    expect((await svc.activate(KEY)).error).toMatch(/doesn’t exist/);
    expect((await svc.activate(KEY)).error).toMatch(/No connection/);
    expect(svc.allowed()).toBe(false);
  });

  it('starts without asking when the last check is recent, asks otherwise', async () => {
    const { svc, ls, clock } = service({ activate: [activated], validate: [valid] });
    await svc.activate(KEY);
    clock.now += FRESH_MS - 1000;
    expect((await svc.startup()).status).toBe('active');
    expect(ls.calls.map((c) => c.path)).toEqual(['activate']);
    clock.now += 2000;
    const state = await svc.startup();
    expect(state).toMatchObject({ status: 'active', validatedAt: clock.now, activations: { used: 2, limit: 3 } });
    expect(ls.calls[1]).toEqual({ path: 'validate', params: { license_key: KEY, instance_id: 'inst_1' } });
  });

  it('keeps working offline for 14 days, then blocks', async () => {
    const { svc, clock } = service({ activate: [activated], validate: ['offline', { status: 503, body: {} }, 'offline'] });
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

  it('blocks and forgets the key when Lemon Squeezy refuses it (refund, disabled, activation removed)', async () => {
    const { svc, file } = service({ activate: [activated, activated], validate: [{ status: 200, body: { valid: false, error: null, license_key: { ...lk, status: 'disabled' }, meta } }, { status: 404, body: { valid: false, error: 'instance_id not found.' } }] });
    await svc.activate(KEY);
    let state = await svc.validate();
    expect(state.status).toBe('invalid');
    expect(state.error).toMatch(/disabled/);
    expect(svc.allowed()).toBe(false);
    expect(() => readFileSync(file)).toThrow();
    await svc.activate(KEY);
    state = await svc.validate();
    expect(state).toMatchObject({ status: 'invalid' });
    expect(state.error).toMatch(/removed/);
  });

  it('deactivates this computer, also when Lemon Squeezy already forgot it', async () => {
    const { svc, ls } = service({ activate: [activated, activated], deactivate: ['offline', { status: 200, body: { deactivated: true } }, { status: 404, body: { deactivated: false, error: 'instance_id not found.' } }] });
    await svc.activate(KEY);
    expect((await svc.deactivate()).ok).toBe(false);
    expect(svc.allowed()).toBe(true);
    expect(await svc.deactivate()).toEqual({ ok: true, error: null });
    expect(svc.state().status).toBe('none');
    await svc.activate(KEY);
    expect((await svc.deactivate()).ok).toBe(true);
    expect(ls.calls.filter((c) => c.path === 'deactivate')).toHaveLength(3);
  });
});
