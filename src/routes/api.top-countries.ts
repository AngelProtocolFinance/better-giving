import { getISOWeek } from "date-fns";
import type { LoaderFunction } from "react-router";
import { resp } from "@/helpers/https";
import { countries_query } from "$/pg/queries/country";

const cache = "public, s-maxage=300, stale-while-revalidate=3600";

export const loader: LoaderFunction = async () => {
  const items = await countries_query();

  const latest_weeknum = getISOWeek(items[0].updated_at!);
  const sorted = items.toSorted((a, b) => {
    const a7d_v =
      getISOWeek(a.updated_at!) < latest_weeknum
        ? 0
        : Number(a.total_donations_7d ?? 0);
    const b7d_v =
      getISOWeek(b.updated_at!) < latest_weeknum
        ? 0
        : Number(b.total_donations_7d ?? 0);
    //if both didn't receive donation in the last 7days
    if (!a7d_v && !b7d_v)
      return Number(b.total_donations ?? 0) - Number(a.total_donations ?? 0);
    return b7d_v - a7d_v;
  });

  return resp.json(
    sorted.slice(0, 10).map(({ name }) => name),
    200,
    { "cache-control": cache }
  );
};
