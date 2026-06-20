import { Portal } from "@ark-ui/react/portal";
import { createListCollection, Select } from "@ark-ui/react/select";
import { href, Link, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { DrawerIcon } from "#/components/icon";
import { Info } from "#/components/status";
import type { Route } from "./+types/route";
import { FundItem } from "./fund-item";

type Creator = "ours" | "others";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

const LABELS: Record<string, string> = {
  "": "All",
  ours: "By Us",
  others: "By Our Supporters",
};
const OPTIONS: string[] = Object.keys(LABELS);
const COLLECTION = createListCollection({
  items: OPTIONS,
  itemToString: (v) => LABELS[v],
});

function Page({ loaderData }: Route.ComponentProps) {
  const { funds, endow, user } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const creator = (searchParams.get("creator") ?? "") as Creator | "";

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h3 className="text-3xl font-bold">Fundraisers</h3>
        <div className="flex items-center gap-3">
          <Select.Root
            collection={COLLECTION}
            value={[creator]}
            onValueChange={(e) => {
              const v = e.value[0];
              setSearchParams(v ? { creator: v } : {}, {
                preventScrollReset: true,
              });
            }}
            positioning={{ placement: "bottom-start", gutter: 8 }}
          >
            <Select.Trigger className="flex items-center gap-2 text-sm border rounded px-3 py-1.5 outline-ring focus:outline-2 data-[state=open]:outline-2">
              <Select.ValueText placeholder="All" />
              <Select.Context>
                {(api) => (
                  <DrawerIcon
                    is_open={api.open}
                    size={16}
                    className="shrink-0"
                  />
                )}
              </Select.Context>
            </Select.Trigger>
            <Portal>
              <Select.Positioner>
                <Select.Content className="rounded-xs border bg-popover text-popover-fg min-w-(--reference-width) w-max z-10 origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out">
                  {OPTIONS.map((val) => (
                    <Select.Item
                      key={val || "all"}
                      item={val}
                      className="selector-opt text-sm"
                    >
                      <Select.ItemText>{LABELS[val]}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
          <Link
            to={{
              pathname: href("/fundraisers/new"),
              search: `npo=${endow.id}`,
            }}
            className="btn btn-primary text-sm px-4 py-1.5 rounded"
          >
            + Create
          </Link>
        </div>
      </div>
      <div className="grid @xl:grid-cols-2 @2xl:grid-cols-3 gap-4">
        {funds.length === 0 ? (
          <Info classes="mt-4">No fundraisers found</Info>
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
