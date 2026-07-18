import type { Fetcher } from "@/types/api";
import { coingecko as coingecko_env } from "../env";

export const coingecko: Fetcher = (url_fn, init_fn) => {
  const x = new URL("https://api.coingecko.com");
  const h = new Headers({
    "x-cg-demo-api-key": coingecko_env.api_key,
    accept: "application/json",
  });
  return fetch(
    url_fn(x, (p) => p),
    init_fn?.(h) || { headers: h }
  );
};
