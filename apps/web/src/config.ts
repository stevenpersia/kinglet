/** Everything that changes from one release or one decision to the next lives here. */
declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__;
export const MCP_COMMAND = 'claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless';

/** One-time price, shown before launch too. */
export const PRICE = { amount: 49, currency: '€', label: '€49' };

/**
 * Before launch there is no download: people leave their email (functions/waitlist.ts, a Resend audience)
 * and get the launch discount by email.
 */
export const WAITLIST_API = '/api/waitlist';
export const LAUNCH_OFFER = 'a launch discount';
