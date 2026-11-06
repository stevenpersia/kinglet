/** Everything that changes from one release or one decision to the next lives here. */
declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__;
export const RELEASES = 'https://github.com/stevenpersia/kinglet-releases';
export const DOWNLOAD = `${RELEASES}/releases/latest`;
export const MCP_COMMAND = 'claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless';

/**
 * One-time price. The checkout (Lemon Squeezy, Paddle, Stripe Payment Link…) comes from VITE_CHECKOUT_URL at build time;
 * until it is set, "Buy" leads to the download.
 */
export const PRICE = { amount: 49, currency: '€', label: '€49' };
export const CHECKOUT = (import.meta.env.VITE_CHECKOUT_URL as string | undefined) || null;
