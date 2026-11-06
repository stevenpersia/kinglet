import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { t } from '@kinglet/core';
import type { LicenseState } from '../shared/types';

/**
 * Kinglet's license: a Polar license key (License Keys benefit of the Kinglet product), activated
 * once per computer. https://polar.sh/docs/features/benefits/license-keys — the customer portal's
 * activate, validate and deactivate take the key itself, no access token, and are meant to be
 * called from a desktop app: Kinglet talks to Polar directly.
 *
 * Without a valid license the app doesn't open at all (index.ts): only the license window, and
 * `kinglet --mcp` refuses to start. The key is checked at startup (skipped when the last check is
 * less than a day old), then every 6 hours. Without a connection, the last successful check holds
 * for 14 days.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Without a connection, Kinglet keeps working this long after the last successful check. */
export const GRACE_MS = 14 * DAY;
/** A check this recent lets Kinglet start without waiting for Polar. */
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
  /** Polar's activation ID for this computer. */
  instanceId: string;
  instanceName: string;
  email: string | null;
  customer: string | null;
  activationLimit: number | null;
  validatedAt: number;
}

/** A Polar license key, as activate (inside `license_key`) and validate (at the top) return it. */
interface PolarKey {
  benefit_id?: string;
  organization_id?: string;
  status?: string;
  limit_activations?: number | null;
  customer?: { email?: string | null; name?: string | null } | null;
}

interface PolarAnswer extends PolarKey {
  /** activate: the activation's ID. */
  id?: string;
  license_key?: PolarKey;
  /** validate: the activation that was checked. */
  activation?: { id?: string } | null;
  error?: string;
  detail?: unknown;
}

type Call = { kind: 'answer'; status: number; body: PolarAnswer } | { kind: 'offline'; error: string };

export interface LicenseOptions {
  file: string;
  /** Organization and benefit the key must belong to; null fields: not configured yet, every key is refused. */
  product: { organizationId: string | null; benefitId: string | null };
  instanceName: string;
  /** false in the development build: no license asked. */
  enforced: boolean;
  seal?: Sealer;
  fetch?: typeof fetch;
  now?: () => number;
  api?: string;
}

export const maskKey = (key: string) => (key.length > 8 ? `••••-${key.slice(-8)}` : '••••');

const detailOf = (body: PolarAnswer) => (typeof body.detail === 'string' ? body.detail : '');

const MSG = {
  limit: () =>
    t(
      'This key is already active on as many computers as it allows. Deactivate it on another one (Settings → License, or Polar’s customer portal), then try again.',
      'Cette clé est déjà active sur le nombre maximum d’ordinateurs. Désactive-la sur un autre (Réglages → Licence, ou l’espace client Polar), puis réessaie.',
    ),
  unknown: () => t('This key doesn’t exist. Check it in your purchase email.', 'Cette clé n’existe pas. Vérifie-la dans ton e-mail d’achat.'),
  revoked: () => t('This key has been revoked (refund or support). Contact support if it’s a mistake.', 'Cette clé a été révoquée (remboursement ou support). Contacte le support si c’est une erreur.'),
  notKinglet: () => t('This key isn’t a Kinglet key.', 'Cette clé n’est pas une clé Kinglet.'),
  noLonger: () =>
    t(
      'Polar no longer accepts this key on this computer (refunded, revoked, or this computer’s activation was removed). Enter your key again.',
      'Polar n’accepte plus cette clé sur cet ordinateur (remboursée, révoquée, ou activation de cet ordinateur supprimée). Saisis à nouveau ta clé.',
    ),
};

/** Polar's answer to activate, explained (403: refused, 404: unknown key, 422: not even a key). */
export function explainActivate(status: number, body: PolarAnswer): string {
  const detail = detailOf(body);
  // Polar's messages: "…activation limit already reached", "License key is no longer active…",
  // "License key has expired.", "This license key does not support activations…".
  if (status === 403) {
    if (/limit/i.test(detail)) return MSG.limit();
    if (/expired/i.test(detail)) return t('This key has expired.', 'Cette clé a expiré.');
    if (/support activations/i.test(detail))
      return t('This key can’t be activated on a computer (the product has no activation limit). Contact support.', 'Cette clé ne peut pas être activée sur un ordinateur (le produit n’a pas de limite d’activations). Contacte le support.');
    return MSG.revoked();
  }
  if (status === 404 || status === 422) return MSG.unknown();
  return detail || t(`Polar refused this key (${status}).`, `Polar a refusé cette clé (${status}).`);
}

export class LicenseService {
  private seal: Sealer;
  private fetcher: typeof fetch;
  private now: () => number;
  private api: string;
  /** Last error to show (refused key, no connection…). */
  private lastError: string | null = null;
  private lastStatus: LicenseState['status'] | null = null;

  constructor(private o: LicenseOptions) {
    this.seal = o.seal ?? plainSealer;
    this.fetcher = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.api = (o.api ?? 'https://api.polar.sh').replace(/\/$/, '');
  }

  get configured() {
    return !!this.o.product.organizationId && !!this.o.product.benefitId;
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

  private save(s: Omit<Stored, 'encrypted'>) {
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

  private belongs(key: PolarKey | undefined) {
    return !!key && key.benefit_id === this.o.product.benefitId && (key.organization_id === undefined || key.organization_id === this.o.product.organizationId);
  }

  private async call(path: 'activate' | 'validate' | 'deactivate', params: Record<string, string>): Promise<Call> {
    try {
      const res = await this.fetcher(`${this.api}/v1/customer-portal/license-keys/${path}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ organization_id: this.o.product.organizationId, ...params }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Polar down or rate limiting: like being offline, the last check still holds.
      if (res.status >= 500 || res.status === 429) return { kind: 'offline', error: `Polar ${res.status}` };
      const body = res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as PolarAnswer);
      return { kind: 'answer', status: res.status, body };
    } catch (e) {
      return { kind: 'offline', error: (e as Error).message };
    }
  }

  state(): LicenseState {
    const s = this.load();
    const key = s && this.keyOf(s);
    const base: LicenseState = {
      status: 'none',
      key: key ? maskKey(key) : null,
      email: s?.email ?? null,
      customer: s?.customer ?? null,
      instanceName: s?.instanceName ?? null,
      activationLimit: s?.activationLimit ?? null,
      validatedAt: s?.validatedAt ?? null,
      error: this.lastError,
    };
    if (!this.o.enforced) return { ...base, status: 'dev', error: null };
    if (!this.configured) return { ...base, status: 'unconfigured', error: t('This build of Kinglet can’t check licenses yet.', 'Cette version de Kinglet ne sait pas encore vérifier les licences.') };
    if (this.lastStatus && this.lastStatus !== 'active' && this.lastStatus !== 'offline') return { ...base, status: this.lastStatus };
    if (!s) return base;
    if (this.age(s) >= GRACE_MS) return { ...base, status: 'expired' };
    return { ...base, status: this.lastStatus ?? 'active' };
  }

  /** Whether Kinglet may open: the license window shows when it may not. */
  allowed(state = this.state()) {
    return state.status === 'dev' || state.status === 'active' || state.status === 'offline';
  }

  /**
   * At startup: a check less than a day old is enough (Kinglet opens at once and checks again later);
   * otherwise asks Polar first.
   */
  async startup(): Promise<LicenseState> {
    if (!this.o.enforced || !this.configured) return this.state();
    const s = this.load();
    if (!s || this.age(s) < FRESH_MS) return this.state();
    return this.validate();
  }

  private details(key: PolarKey | undefined): Pick<Stored, 'email' | 'customer' | 'activationLimit'> {
    return { email: key?.customer?.email ?? null, customer: key?.customer?.name ?? null, activationLimit: key?.limit_activations ?? null };
  }

  /** Checks this computer's activation with Polar. */
  async validate(): Promise<LicenseState> {
    if (!this.o.enforced || !this.configured) return this.state();
    const s = this.load();
    const key = s && this.keyOf(s);
    if (!s || !key) {
      if (s) this.clear();
      return this.state();
    }
    // benefit_id makes Polar itself refuse a key of another product.
    const res = await this.call('validate', { key, activation_id: s.instanceId, benefit_id: this.o.product.benefitId! });
    if (res.kind === 'offline') {
      this.lastStatus = this.age(s) < GRACE_MS ? 'offline' : 'expired';
      this.lastError =
        this.lastStatus === 'offline'
          ? null
          : t('Kinglet couldn’t reach Polar for 14 days. Connect to the internet to check your license.', 'Kinglet n’a pas pu joindre Polar depuis 14 jours. Connecte-toi à internet pour vérifier ta licence.');
      return this.state();
    }
    const { status, body } = res;
    if (status === 200 && body.status === 'granted' && this.belongs(body) && body.activation?.id === s.instanceId) {
      this.save({ ...s, key, ...this.details(body), validatedAt: this.now() });
      this.lastStatus = 'active';
      this.lastError = null;
      return this.state();
    }
    // 404: revoked (refund), disabled, expired, or the activation was removed in Polar.
    this.clear();
    this.lastStatus = 'invalid';
    this.lastError = status === 200 && !this.belongs(body) ? MSG.notKinglet() : MSG.noLonger();
    return this.state();
  }

  /** Activates a key on this computer (one of the key's activations). */
  async activate(rawKey: string): Promise<LicenseState> {
    const key = rawKey.trim();
    if (!key) {
      this.lastStatus = 'none';
      this.lastError = t('Paste your license key.', 'Colle ta clé de licence.');
      return this.state();
    }
    if (!this.configured) return this.state();
    const res = await this.call('activate', { key, label: this.o.instanceName.slice(0, 100) });
    if (res.kind === 'offline') {
      this.lastStatus = 'none';
      this.lastError = t('No connection to Polar. Activating needs the internet once.', 'Pas de connexion à Polar. L’activation demande internet une fois.');
      return this.state();
    }
    const { status, body } = res;
    if (status !== 200 || !body.id) {
      this.lastStatus = 'none';
      this.lastError = explainActivate(status, body);
      return this.state();
    }
    if (!this.belongs(body.license_key)) {
      // Another product of the organization: give the activation back so the key loses nothing.
      await this.call('deactivate', { key, activation_id: body.id });
      this.lastStatus = 'none';
      this.lastError = MSG.notKinglet();
      return this.state();
    }
    this.save({ key, instanceId: body.id, instanceName: this.o.instanceName, ...this.details(body.license_key), validatedAt: this.now() });
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
    const res = await this.call('deactivate', { key, activation_id: s.instanceId });
    if (res.kind === 'offline') return { ok: false, error: t('No connection to Polar: the activation can’t be freed offline.', 'Pas de connexion à Polar : l’activation ne peut pas être libérée hors ligne.') };
    // 204: done. 404: already gone on Polar's side, which counts as done.
    if (res.status === 204 || res.status === 200 || res.status === 404) {
      this.clear();
      this.lastStatus = null;
      this.lastError = null;
      return { ok: true, error: null };
    }
    return { ok: false, error: detailOf(res.body) || t(`Polar refused (${res.status}).`, `Polar a refusé (${res.status}).`) };
  }
}
