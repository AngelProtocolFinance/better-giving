import { EmptyState, Select } from "@better-giving/ui";
import { useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";
import type { Route } from "./+types/route";
import { FundItem } from "./fund-item";

type Creator = "all" | "ours" | "others";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
// block body: the copy sweep reads `=>` … `<` as text, and `Record<` is the next `<`
export const meta: Route.MetaFunction = ({ matches }) => {
  return admin_page_meta("Supporter fundraisers", matches);
};

export default CacheRoute(Page);

const LABELS: Record<Creator, string> = {
  all: "All",
  ours: "By Us",
  others: "By Our Supporters",
};
const OPTIONS: Creator[] = ["all", "ours", "others"];

function Page({ loaderData }: Route.ComponentProps) {
  const { funds, endow, user } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("creator");
  const creator: Creator = raw === "ours" || raw === "others" ? raw : "all";

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Supporter fundraisers</h1>
          <p className="mt-1 text-sm text-gray-11">
            These are fundraisers people started for your nonprofit. You can
            leave any you don't want to receive from.
          </p>
        </div>
        <Select
          compact
          label="Creator"
          options={OPTIONS}
          value={creator}
          option_disp={(v) => LABELS[v]}
          onChange={(v) => {
            setSearchParams(v === "all" ? {} : { creator: v }, {
              preventScrollReset: true,
            });
          }}
        />
      </div>
      <div className="grid @xl:grid-cols-2 @2xl:grid-cols-3 gap-4">
        {funds.length === 0 ? (
          creator === "all" ? (
            <EmptyState classes="mt-4" heading="No supporter fundraisers yet">
              Fundraisers people start for your nonprofit will show up here.
            </EmptyState>
          ) : (
            <EmptyState classes="mt-4">
              No supporter fundraisers found
            </EmptyState>
          )
        ) : (
          funds.map((fund) => (
            <FundItem
              key={fund.id}
              {...fund}
              isEditor={user.role === "admin" || fund.npo_owner === endow.id}
              isSelf={fund.npo_owner === endow.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
