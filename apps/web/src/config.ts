/** Everything that changes from one release or one decision to the next lives here. */
declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__;
export const MCP_COMMAND = 'claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless';

/** One-time price, shown before launch too. */
export const PRICE = { amount: 49, currency: '$', label: '$49' };

/**
 * Before launch there is no download: people leave their email (functions/waitlist.ts, a Resend audience)
 * and get the launch discount by email.
 */
export const WAITLIST_API = '/api/waitlist';
export const LAUNCH_OFFER = 'a launch discount';

/**
 * Polar checkout link of the Kinglet product (Polar dashboard: Products → Checkout Links,
 * e.g. https://buy.polar.sh/polar_cl_…). While it is null the site keeps the launch list;
 * once set, every "Join the list" becomes "Buy Kinglet". Polar hands out the license key, which
 * the app asks for on first launch.
 */
export const CHECKOUT_URL: string | null = null;
export const LAUNCHED = CHECKOUT_URL !== null;
/** Where buyers download the app (public releases). */
export const DOWNLOAD_URL = 'https://github.com/stevenpersia/kinglet-releases/releases/latest';
/** Polar's customer portal: buyers find their order and license key there, from their email. */
export const PORTAL_URL = 'https://polar.sh/kinglet/portal';
// Polar checkout link (Products → Checkout Links): Success URL https://getkinglet.com/thanks?checkout_id={CHECKOUT_ID}
// (src/Thanks.tsx), Return URL https://getkinglet.com/#pricing.
