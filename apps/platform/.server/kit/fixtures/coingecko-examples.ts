import simple_price from "./simple-price.json";
import simple_token_price from "./simple-token-price.json";

/**
 * Published CoinGecko price examples, copied verbatim into the JSON files
 * next to this module. JSON has no comment syntax, so the source of each
 * file is named here.
 *
 * - `simple_price` — https://docs.coingecko.com/reference/simple-price
 *   200 example (`ids=bitcoin`, `vs_currencies=usd`)
 * - `simple_token_price` — https://docs.coingecko.com/reference/simple-token-price
 *   200 example (ethereum WBTC `0x2260fac5e5542a773aa44fbcfedf7c193bc2c599`)
 */
export { simple_price, simple_token_price };

/** the example is keyed by the id that request asked for (`bitcoin`) */
export const simple_price_for = (id: string) => ({
  [id]: simple_price.bitcoin,
});
