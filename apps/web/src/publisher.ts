/**
 * Who publishes and sells Kinglet, for the legal pages (/legal, /terms, /privacy).
 * A null field shows as "[to fill in]" on the page and the build warns about it: fill them all in before launch
 * (French law asks for the publisher's identity, address, registration number and a way to reach them).
 */
export const PUBLISHER = {
  name: 'Steven Persia',
  /** Legal status, e.g. "Entrepreneur individuel (micro-entreprise)". */
  status: null as string | null,
  /** SIREN or SIRET number. */
  siret: null as string | null,
  /** Intra-community VAT number, or "Not applicable (art. 293 B of the French tax code)" under the VAT franchise. */
  vat: null as string | null,
  /** Postal address (a domiciliation address is fine). */
  address: null as string | null,
  /** Contact address shown on every legal page (support, refunds, privacy requests). */
  email: null as string | null,
  country: 'France',
};

/** Date of the current version of the legal pages. Change it with every change to their content. */
export const LEGAL_UPDATED = 'November 6, 2026';

/** Days during which a purchase is refunded on request, no questions asked. */
export const REFUND_DAYS = 14;

export const LEGAL_LINKS: [string, string][] = [
  ['/terms/', 'Terms'],
  ['/privacy/', 'Privacy'],
  ['/legal/', 'Legal notice'],
];

/** The fields still missing, for the build's warning. */
export function missingPublisherFields(): string[] {
  return Object.entries(PUBLISHER)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
}
