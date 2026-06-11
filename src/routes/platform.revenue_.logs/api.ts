import * as v from "valibot";
import { resp } from "@/helpers/https";
import { rev_log_list } from "$/pg/queries/revenue";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { searchParams: s } = new URL(request.url);

  const p = v.safeParse(v.nullable(v.string()), s.get("next"));
  if (p.issues) throw resp.status(400, p.issues[0].message);

  const page = await rev_log_list({
    limit: 20,
    next: p.output ?? undefined,
  });

  return page;
};
