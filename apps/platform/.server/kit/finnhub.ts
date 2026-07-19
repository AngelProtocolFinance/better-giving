import type { Fetcher } from "@/types/api";
import { finnhub as finnhub_env } from "../env";

export const finnhub: Fetcher = (url_fn, init_fn) => {
  const x = new URL("https://finnhub.io");
  x.searchParams.set("token", finnhub_env.api_key);
  const h = new Headers({
    accept: "application/json",
  });
  return fetch(
    url_fn(x, (p) => p),
    init_fn?.(h) || { headers: h }
  );
};
