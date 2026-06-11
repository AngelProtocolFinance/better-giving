import { type IToken, tokens_list } from "@better-giving/crypto";
import Fuse from "fuse.js";
import type { LoaderFunction } from "react-router";
import { resp } from "@/helpers/https";

const tokens_fuse = new Fuse<IToken>(tokens_list, {
  keys: ["name", "code", "network", "symbol"],
});
const subset = tokens_list.slice(0, 10);

export const headers = () => ({
  "cache-control": "public, max-age=3600, s-maxage=3600",
});

export const loader: LoaderFunction = async ({ request }) => {
  const q = new URL(request.url).searchParams.get("q") || "";

  if (!q) return resp.json(subset);
  const filtered = tokens_fuse.search(q, { limit: 10 }).map((x) => x.item);

  return resp.json(filtered);
};
