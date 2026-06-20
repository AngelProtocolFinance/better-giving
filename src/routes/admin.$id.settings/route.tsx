import { Tabs } from "@ark-ui/react/tabs";
import { Outlet } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import type { DonateMethodId } from "@/schemas";
import type { Route } from "./+types/route";
import { DonationTab } from "./donation";
import { DonationFormTab } from "./donation-form";
import { FundraiserTab } from "./fundraiser";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: endow }: Route.ComponentProps) {
  const tabs = [
    { id: "donation", name: "Donation" },
    { id: "fundraiser", name: "Fundraiser" },
    { id: "donation-form", name: "Donation Form" },
  ];
  return (
    <div className="w-full max-w-4xl">
      <Tabs.Root defaultValue="donation">
        <Tabs.List className="flex gap-2 border-b">
          {tabs.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="px-4 border-b-2 py-2 text-sm font-medium transition-colors focus:outline-none border-transparent text-muted-fg hover:text-fg data-selected:border-primary data-selected:text-primary"
            >
              {tab.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="px-6 py-4 md:px-10 md:py-8">
          <Tabs.Content value="donation">
            <DonationTab
              receipt_msg={endow.receipt_msg ?? ""}
              donor_address_required={endow.donor_address_required ?? false}
              hide_bg_tip={endow.hide_bg_tip ?? false}
            />
          </Tabs.Content>
          <Tabs.Content value="fundraiser">
            <FundraiserTab fund_opt_in={endow.fund_opt_in ?? false} />
          </Tabs.Content>

          <Tabs.Content value="donation-form">
            <DonationFormTab
              donate_methods={
                endow.donate_methods ?? (["stripe"] as DonateMethodId[])
              }
              increments={endow.increments ?? []}
              target={endow.target}
              freqs={endow.donate_frequencies ?? undefined}
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>
      <Outlet />
    </div>
  );
}
