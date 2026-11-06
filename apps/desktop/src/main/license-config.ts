/**
 * Polar organization and License Keys benefit that Kinglet's keys come from (not secrets).
 * - organizationId: Polar dashboard → Settings → General, "Organization ID".
 * - benefitId: Products → Benefits → the "License Keys" benefit of Kinglet, its ID.
 * A key from another organization or another benefit is refused. Until both are filled in, the
 * installed app refuses every key (the development build doesn't ask for one).
 */
export const POLAR: { organizationId: string | null; benefitId: string | null } = {
  organizationId: 'f0f9f1df-e6ff-4cf8-8880-5188ea951f47',
  benefitId: 'c2ba08de-14f6-4970-86be-322300452003',
};

/** Where "Buy Kinglet" leads (the Pricing section, which opens the Polar checkout). */
export const BUY_URL = 'https://getkinglet.com/#pricing';
/** Polar's customer portal, where buyers find their key again from their email (polar.sh/<organization slug>/portal). */
export const ORDERS_URL = 'https://polar.sh/kinglet/portal';
export { PRIVACY_URL, TERMS_URL } from '../shared/legal';
