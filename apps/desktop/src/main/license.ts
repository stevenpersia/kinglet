import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { t } from '@kinglet/core';
import type { LicenseState } from '../shared/types';

/**
 * Kinglet's license: a Lemon Squeezy license key, activated once per computer.
 * https://docs.lemonsqueezy.com/api/license-api — activate, validate, deactivate. These three calls
 * take the key itself, no API key, so the app talks to Lemon Squeezy directly.
 *
 * Without a valid license the app doesn't open at all (index.ts): only the license window, and
 * `kinglet --mcp` refuses to start. The key is checked at startup (skipped when the last check is
 * less than a day old), then every 6 hours. Without a connection, the last successful check holds
 * for 14 days.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Without a connection, Kinglet keeps working this long after the last successful check. */
export const GRACE_MS = 14 * DAY;
/** A check this recent lets Kinglet start without waiting for Lemon Squeezy. */
export const FRESH_MS = DAY;
const TIMEOUT_MS = 8000;

export interface Sealer {
  available(): boolean;
  encrypt(text: string): string;
  decrypt(sealed: string): string;
}

/** No keyring (or tests): the file stays readable by the user only (mode 600). */
export const plainSealer: Sealer = { available: () => false, encrypt: (s) => s, decrypt: (s) => s };

interface Stored {
  key: string;
  encrypted: boolean;
  instanceId: string;
  instanceName: string;
  email: string | null;
  customer: string | null;
  activations: { used: number; limit: number | null } | null;
  validatedAt: number;
}

/** What the License API answers (only the fields Kinglet reads). */
interface LsResponse {
  activated?: boolean;
  valid?: boolean;
  deactivated?: boolean;
  error?: string | null;
  license_key?: { status?: string; activation_limit?: number | null; activation_usage?: number } | null;
  instance?: { id?: string; name?: string } | null;
  meta?: { store_id?: number; product_id?: number; customer_name?: string; customer_email?: string } | null;
}

type Call = { kind: 'answer'; status: number; body: LsResponse } | { kind: 'offline'; error: string };

export interface LicenseOptions {
  file: string;
  /** Store and product the key must belong to; null fields: not configured yet, every key is refused. */
  product: { storeId: number | null; productId: number | null };
  instanceName: string;
  /** false in the development build: no license asked. */
  enforced: boolean;
  seal?: Sealer;
  fetch?: typeof fetch;
  now?: () => number;
  api?: string;
}

export const maskKey = (key: string) => (key.length > 8 ? `••••-${key.slice(-8)}` : '••••');

/** Lemon Squeezy's messages are in English and terse: the common ones, explained. */
export function explainError(raw: string | null | undefined): string {
  const m = raw ?? '';
  if (/activation limit/i.test(m))
    return t(
      'This key is already active on as many computers as it allows. Deactivate it on another one (Settings → License), then try again.',
      'Cette clé est déjà active sur le nombre maximum d’ordinateurs. Désactive-la sur un autre (Réglages → Licence), puis réessaie.',
    );
  if (/license_key.*not found|key not found|invalid.*key|not.*valid/i.test(m)) return t('This key doesn’t exist. Check it in your purchase email.', 'Cette clé n’existe pas. Vérifie-la dans ton e-mail d’achat.');
  if (/instance.*not found/i.test(m)) return t('This computer’s activation was removed. Enter your key again.', 'L’activation de cet ordinateur a été supprimée. Saisis à nouveau ta clé.');
  if (/disabled/i.test(m)) return t('This key has been disabled (refund or support). Contact support if it’s a mistake.', 'Cette clé a été désactivée (remboursement ou support). Contacte le support si c’est une erreur.');
  if (/expired/i.test(m)) return t('This key has expired.', 'Cette clé a expiré.');
  return m || t('Lemon Squeezy refused this key.', 'Lemon Squeezy a refusé cette clé.');
}

export class LicenseService {
  private seal: Sealer;
  private fetcher: typeof fetch;
  private now: () => number;
  private api: string;
  /** Last error to show (refused key, no connection…), with the key that was refused to prefill the field. */
  private lastError: string | null = null;
  private lastStatus: LicenseState['status'] | null = null;

  constructor(private o: LicenseOptions) {
    this.seal = o.seal ?? plainSealer;
    this.fetcher = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.api = (o.api ?? 'https://api.lemonsqueezy.com').replace(/\/$/, '');
  }

  get configured() {
    return this.o.product.storeId != null && this.o.product.productId != null;
  }

  private load(): Stored | null {
    try {
      if (!existsSync(this.o.file)) return null;
      const s = JSON.parse(readFileSync(this.o.file, 'utf8')) as Stored;
      return s.key && s.instanceId && typeof s.validatedAt === 'number' ? s : null;
    } catch {
      return null;
    }
  }

  private keyOf(s: Stored): string | null {
    try {
      return s.encrypted ? this.seal.decrypt(s.key) : s.key;
    } catch {
      return null;
    }
  }

  private save(s: Omit<Stored, 'encrypted' | 'key'> & { key: string }) {
    const encrypted = this.seal.available();
    mkdirSync(dirname(this.o.file), { recursive: true });
    const stored: Stored = { ...s, key: encrypted ? this.seal.encrypt(s.key) : s.key, encrypted };
    writeFileSync(this.o.file, JSON.stringify(stored, null, 2), { mode: 0o600 });
  }

  private clear() {
    rmSync(this.o.file, { force: true });
  }

  /** A check that claims to be from the future (clock moved back, file edited) doesn't count. */
  private age(s: Stored) {
    const age = this.now() - s.validatedAt;
    return age < -DAY ? Infinity : Math.max(0, age);
  }

  private belongs(meta: LsResponse['meta']) {
    return !!meta && meta.store_id === this.o.product.storeId && meta.product_id === this.o.product.productId;
  }

  private async call(path: 'activate' | 'validate' | 'deactivate', params: Record<string, string>): Promise<Call> {
    try {
      const res = await this.fetcher(`${this.api}/v1/licenses/${path}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Lemon Squeezy down or rate limiting: like being offline, the last check still holds.
      if (res.status >= 500 || res.status === 429) return { kind: 'offline', error: `Lemon Squeezy ${res.status}` };
      const body = (await res.json().catch(() => ({}))) as LsResponse;
      return { kind: 'answer', status: res.status, body };
    } catch (e) {
      return { kind: 'offline', error: (e as Error).message };
    }
  }

  state(): LicenseState {
    const s = this.load();
    const base: LicenseState = {
      status: 'none',
      key: s ? (this.keyOf(s) ? maskKey(this.keyOf(s)!) : null) : null,
      email: s?.email ?? null,
      customer: s?.customer ?? null,
      instanceName: s?.instanceName ?? null,
      activations: s?.activations ?? null,
      validatedAt: s?.validatedAt ?? null,
      error: this.lastError,
    };
    if (!this.o.enforced) return { ...base, status: 'dev', error: null };
    if (!this.configured) return { ...base, status: 'unconfigured', error: t('This build of Kinglet can’t check licenses yet.', 'Cette version de Kinglet ne sait pas encore vérifier les licences.') };
    if (this.lastStatus && this.lastStatus !== 'active' && this.lastStatus !== 'offline') return { ...base, status: this.lastStatus };
    if (!s) return base;
    const age = this.age(s);
    if (age >= GRACE_MS) return { ...base, status: 'expired' };
    return { ...base, status: this.lastStatus ?? 'active' };
  }

  /** Whether Kinglet may open: the license window shows when it may not. */
  allowed(state = this.state()) {
    return state.status === 'dev' || state.status === 'active' || state.status === 'offline';
  }

  /**
   * At startup: a check less than a day old is enough (Kinglet opens at once and checks again later);
   * otherwise asks Lemon Squeezy first.
   */
  async startup(): Promise<LicenseState> {
    if (!this.o.enforced || !this.configured) return this.state();
    const s = this.load();
    if (!s) return this.state();
    if (this.age(s) < FRESH_MS) return this.state();
    return this.validate();
  }

  /** Checks the key of this computer with Lemon Squeezy. */
  async validate(): Promise<LicenseState> {
    if (!this.o.enforced || !this.configured) return this.state();
    const s = this.load();
    const key = s && this.keyOf(s);
    if (!s || !key) {
      if (s) this.clear();
      return this.state();
    }
    const res = await this.call('validate', { license_key: key, instance_id: s.instanceId });
    if (res.kind === 'offline') {
      this.lastStatus = this.age(s) < GRACE_MS ? 'offline' : 'expired';
      this.lastError =
        this.lastStatus === 'offline'
          ? null
          : t('Kinglet couldn’t reach Lemon Squeezy for 14 days. Connect to the internet to check your license.', 'Kinglet n’a pas pu joindre Lemon Squeezy depuis 14 jours. Connecte-toi à internet pour vérifier ta licence.');
      return this.state();
    }
    const { body } = res;
    if (body.valid && this.belongs(body.meta) && body.instance?.id === s.instanceId && body.license_key?.status !== 'disabled') {
      this.save({ ...s, key, ...this.details(body), validatedAt: this.now() });
      this.lastStatus = 'active';
      this.lastError = null;
      return this.state();
    }
    // Refused (refund, key disabled, activation removed from the Lemon Squeezy dashboard…).
    this.clear();
    this.lastStatus = 'invalid';
    this.lastError =
      body.valid && !this.belongs(body.meta)
        ? t('This key isn’t a Kinglet key.', 'Cette clé n’est pas une clé Kinglet.')
        : explainError(body.error ?? (body.license_key?.status === 'disabled' ? 'disabled' : body.instance?.id !== s.instanceId ? 'instance not found' : null));
    return this.state();
  }

  private details(body: LsResponse): Pick<Stored, 'email' | 'customer' | 'activations'> {
    const lk = body.license_key;
    return {
      email: body.meta?.customer_email ?? null,
      customer: body.meta?.customer_name ?? null,
      activations: lk ? { used: lk.activation_usage ?? 0, limit: lk.activation_limit ?? null } : null,
    };
  }

  /** Activates a key on this computer (one of the key's activations). */
  async activate(rawKey: string): Promise<LicenseState> {
    const key = rawKey.trim();
    if (!key) {
      this.lastError = t('Paste your license key.', 'Colle ta clé de licence.');
      this.lastStatus = 'none';
      return this.state();
    }
    if (!this.configured) return this.state();
    const res = await this.call('activate', { license_key: key, instance_name: this.o.instanceName });
    if (res.kind === 'offline') {
      this.lastStatus = 'none';
      this.lastError = t('No connection to Lemon Squeezy. Activating needs the internet once.', 'Pas de connexion à Lemon Squeezy. L’activation demande internet une fois.');
      return this.state();
    }
    const { body } = res;
    const instanceId = body.instance?.id;
    if (!body.activated || !instanceId) {
      this.lastStatus = 'none';
      this.lastError = explainError(body.error);
      return this.state();
    }
    if (!this.belongs(body.meta)) {
      // Someone else's product: give the activation back so the key loses nothing.
      await this.call('deactivate', { license_key: key, instance_id: instanceId });
      this.lastStatus = 'none';
      this.lastError = t('This key isn’t a Kinglet key.', 'Cette clé n’est pas une clé Kinglet.');
      return this.state();
    }
    this.save({ key, instanceId, instanceName: this.o.instanceName, ...this.details(body), validatedAt: this.now() });
    this.lastStatus = 'active';
    this.lastError = null;
    return this.state();
  }

  /** Frees this computer's activation (to move Kinglet to another computer). */
  async deactivate(): Promise<{ ok: boolean; error: string | null }> {
    const s = this.load();
    const key = s && this.keyOf(s);
    if (!s || !key) {
      this.clear();
      return { ok: true, error: null };
    }
    const res = await this.call('deactivate', { license_key: key, instance_id: s.instanceId });
    if (res.kind === 'offline') return { ok: false, error: t('No connection to Lemon Squeezy: the activation can’t be freed offline.', 'Pas de connexion à Lemon Squeezy : l’activation ne peut pas être libérée hors ligne.') };
    // Already gone on Lemon Squeezy's side counts as done.
    if (res.body.deactivated || res.status === 404) {
      this.clear();
      this.lastStatus = null;
      this.lastError = null;
      return { ok: true, error: null };
    }
    return { ok: false, error: explainError(res.body.error) };
  }
}
