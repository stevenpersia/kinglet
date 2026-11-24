/** Everything that changes from one release or one decision to the next lives here. */
declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__;
export const MCP_COMMAND = 'claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless';

/**
 * Kinglet is free: the site offers the download, the paid parts (Pricing, checkout, launch list) are hidden.
 * Their code stays (components/Pricing.tsx, Get.tsx's BuyButton, Waitlist.tsx) for a paid offer later.
 */
export const FREE = true;

/** One-time price (paid offer, hidden while FREE). */
export const PRICE = { amount: 79, currency: '$', label: '$79' };
/**
 * Launch price for the first LAUNCH_SEATS buyers: a Polar discount (79 → 59, at most LAUNCH_SEATS redemptions)
 * preset on the checkout link. Once it runs out, Polar ignores it and the link charges PRICE again.
 * After launch, /api/launch-offer (functions/launch-offer.ts) says how many are left, and the site shows it.
 */
export const LAUNCH_PRICE = { amount: 59, currency: '$', label: '$59' };
export const LAUNCH_SEATS = 100;
export const LAUNCH_API = '/api/launch-offer';

/** Before launch there is no download: people leave their email (functions/waitlist.ts, a Resend audience) to hear at launch. */
export const WAITLIST_API = '/api/waitlist';
export const LAUNCH_OFFER = `${LAUNCH_PRICE.label} for the first ${LAUNCH_SEATS} buyers`;

/**
 * Polar checkout link of the Kinglet product (Polar dashboard: Products → Checkout Links,
 * e.g. https://buy.polar.sh/polar_cl_…). While it is null the site keeps the launch list;
 * once set, every "Join the list" becomes "Buy Kinglet". Polar hands out the license key, which
 * the app asks for on first launch.
 */
export const CHECKOUT_URL: string | null = null;
export const LAUNCHED = !FREE && CHECKOUT_URL !== null;
/** Where everyone downloads the app: the latest GitHub release of the Kinglet repository (AppImage, pacman). */
export const DOWNLOAD_URL = 'https://github.com/stevenpersia/kinglet/releases/latest';
/** Polar's customer portal: buyers find their order and license key there, from their email. */
export const PORTAL_URL = 'https://polar.sh/kinglet/portal';
// Polar checkout link (Products → Checkout Links): Success URL https://getkinglet.com/thanks?checkout_id={CHECKOUT_ID}
// (src/Thanks.tsx), Return URL https://getkinglet.com/#pricing.
