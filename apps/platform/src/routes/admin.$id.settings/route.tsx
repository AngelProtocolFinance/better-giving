import { TabPanel, Tabs } from "@better-giving/ui";
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
      <Tabs
        items={tabs.map((tab) => ({ value: tab.id, label: tab.name }))}
        defaultValue="donation"
      >
        <div className="px-6 py-4 md:px-10 md:py-8">
          <TabPanel value="donation">
            <DonationTab
              receipt_msg={endow.receipt_msg ?? ""}
              donor_address_required={endow.donor_address_required ?? false}
              hide_bg_tip={endow.hide_bg_tip ?? false}
            />
          </TabPanel>
          <TabPanel value="fundraiser">
            <FundraiserTab fund_opt_in={endow.fund_opt_in ?? false} />
          </TabPanel>

          <TabPanel value="donation-form">
            <DonationFormTab
              donate_methods={
                endow.donate_methods ?? (["stripe"] as DonateMethodId[])
              }
              increments={endow.increments ?? []}
              target={endow.target}
              freqs={endow.donate_frequencies ?? undefined}
            />
          </TabPanel>
        </div>
      </Tabs>
      <Outlet />
    </div>
  );
}
