import type { ITokenEstimate } from "#/types/api";
import { resp } from "@/helpers/https";
import { finnhub } from "$/kit/finnhub";
import type { Route } from "./+types/api.tickers.$symbol.estimate";

// resource route: RR returns the loader Response as-is and does not apply
// the `headers` export, so cache-control is set on the Response.
const cache = "public, s-maxage=30, stale-while-revalidate=60";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const res = await finnhub((x) => {
    x.pathname = "api/v1/quote";
    x.searchParams.set("symbol", params.symbol);
    return x;
  });

  if (!res.ok) throw res;

  const BG_MIN = 50;
  // https://finnhub.io/docs/api/quote
  const { pc: usdpu } = await res.json();

  return resp.json({ min: BG_MIN / usdpu, usdpu } satisfies ITokenEstimate, 200, {
    "cache-control": cache,
  });
};
