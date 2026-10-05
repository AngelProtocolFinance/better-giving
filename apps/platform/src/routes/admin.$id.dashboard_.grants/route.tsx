import { ChevronLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { admin_ctx } from "#/.server/auth";
import { use_table } from "#/hooks/use-table";
import { OwedHistory } from "#/routes/_helpers/owed-history";
import { search } from "@/helpers/https";
import {
  grant_run_deductions,
  type IOwedHistoryRow,
  npo_owed_history,
} from "$/pg/queries/owed-history";
import { npo_settlements, type SettlementRow } from "$/pg/queries/payout";
import type { Route } from "./+types/route";
import { GrantsTable, type IGrantLine } from "./common/grants-table";

export const loader = async (x: Route.LoaderArgs) => {
  const { next } = search(x.request);
  const id = x.context.get(admin_ctx);

  const [page, owed] = await Promise.all([
    npo_settlements(id, { next, limit: 5 }),
    npo_owed_history(id),
  ]);
  return {
    ...page,
    items: await with_deductions(id, page.items, owed),
    owed,
  };
};
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

/** a grant that recovered anything owed carries its gross, deductions and net */
async function with_deductions(
  npo_id: number,
  grants: SettlementRow[],
  owed: IOwedHistoryRow[]
): Promise<IGrantLine[]> {
  const recovering = new Set(
    owed.flatMap((r) => r.recoveries.map((l) => l.settlement_id))
  );
  return Promise.all(
    grants.map(async (g) => {
      if (!recovering.has(g.id)) return g;
      const run = await grant_run_deductions(npo_id, g.id);
      return run ? { ...g, run } : g;
    })
  );
}

export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const [search] = useSearchParams();
  const { node } = use_table({
    page1: loaderData,
    table: (x) => <GrantsTable {...x} />,
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });

  return (
    <div className="grid content-start px-6 py-4 md:px-10 md:py-8">
      <Link to=".." className="flex items-center gap-1 link text-sm -ml-1 mb-3">
        <ChevronLeft className="icon-lg" />
        <span>Back</span>
      </Link>
      {node}
      <OwedHistory
        rows={loaderData.owed}
        run_noun="grant"
        received_label="Received"
      />
    </div>
  );
}
