/**
 * Lemon Squeezy store and product that Kinglet's license keys come from (Lemon Squeezy dashboard:
 * Settings → Stores for the store ID, Products → Kinglet for the product ID; not secrets).
 * A key from any other store or product is refused. Until both are filled in, the installed app
 * refuses every key (the development build doesn't ask for one).
 */
export const LEMON_SQUEEZY: { storeId: number | null; productId: number | null } = {
  storeId: null,
  productId: null,
};

/** Where "Buy Kinglet" leads (the Pricing section, which opens the Lemon Squeezy checkout). */
export const BUY_URL = 'https://getkinglet.com/#pricing';
/** Lemon Squeezy's page where buyers find their orders and keys again from their email. */
export const ORDERS_URL = 'https://app.lemonsqueezy.com/my-orders';
