import { useFetcher } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { WithdrawForm } from "#/pages/admin/shared/withdraw-form";
import { withdraw_action } from "#/pages/admin/shared/withdraw-form/withdraw-action";
import type { Route } from "./+types/route";

export { withdraw_loader as loader } from "#/pages/admin/shared/withdraw-form/withdraw-loader";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = withdraw_action({
  liq: "..",
  lock: "..",
});

export default CacheRoute(Page);
function Page({ loaderData: data }: Route.ComponentProps) {
  const fetcher = useFetcher();
  return (
    <WithdrawForm
      bals={{
        liq: data.bal_liq,
        lock: data.bal_lock,
      }}
      onSubmit={(fv) =>
        fetcher.submit(fv, { method: "POST", encType: "application/json" })
      }
      from="lock"
      is_submitting={fetcher.state !== "idle"}
    />
  );
}
