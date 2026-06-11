import { type ITicker, tickers } from "@better-giving/stocks";
import Fuse from "fuse.js";
import type { LoaderFunction } from "react-router";
import { resp } from "@/helpers/https";

const tickers_fuse = new Fuse<ITicker>(tickers, {
  keys: ["symbol", "name"],
});
const subset = tickers.slice(0, 10);

export const headers = () => ({
  "cache-control": "public, max-age=3600, s-maxage=3600",
});

export const loader: LoaderFunction = async ({ request }) => {
  const q = new URL(request.url).searchParams.get("q") || "";

  if (!q) return resp.json(subset);
  const filtered = tickers_fuse.search(q, { limit: 10 }).map((x) => x.item);

  return resp.json(filtered);
};
