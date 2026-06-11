import { Select } from "@base-ui/react/select";
import { useState } from "react";
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
const OPTIONS: [string, string][] = Object.entries(LABELS);

function Page({ loaderData }: Route.ComponentProps) {
  const { funds, endow, user } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const creator = (searchParams.get("creator") ?? "") as Creator | "";
  const [open, setOpen] = useState(false);

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h3 className="text-3xl font-bold">Fundraisers</h3>
        <div className="flex items-center gap-3">
          <Select.Root
            value={creator}
            onValueChange={(v) =>
              setSearchParams(v ? { creator: v } : {}, {
                preventScrollReset: true,
              })
            }
            open={open}
            onOpenChange={setOpen}
          >
            <Select.Trigger className="flex items-center gap-2 text-sm border rounded px-3 py-1.5 outline-ring focus:outline-2 data-[popup-open]:outline-2">
              <Select.Value placeholder="All">
                {() => LABELS[creator]}
              </Select.Value>
              <DrawerIcon is_open={open} size={16} className="shrink-0" />
            </Select.Trigger>
            <Select.Positioner
              side="bottom"
              alignItemWithTrigger={false}
              className="relative z-10"
            >
              <Select.Popup className="rounded-xs border bg-popover text-popover-fg mt-2 min-w-(--anchor-width) w-max origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:scale-90">
                <Select.List>
                  {OPTIONS.map(([val, label]) => (
                    <Select.Item
                      key={val}
                      value={val}
                      className="selector-opt text-sm"
                    >
                      <Select.ItemText>{label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
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
