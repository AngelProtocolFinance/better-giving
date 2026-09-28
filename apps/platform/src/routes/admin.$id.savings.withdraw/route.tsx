import { type ShouldRevalidateFunction, useFetcher } from "react-router";
import {
  CacheRoute,
  createClientLoaderCache,
  type ExtendedComponentProps,
} from "remix-client-cache";
import { WithdrawForm } from "#/pages/admin/shared/withdraw-form";
import { withdraw_action } from "#/pages/admin/shared/withdraw-form/withdraw-action";
import type { Route } from "./+types/route";

export { withdraw_loader as loader } from "#/pages/admin/shared/withdraw-form/withdraw-loader";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = withdraw_action({
  liq: "..",
  lock: "..",
});

export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionStatus,
  defaultShouldRevalidate,
}) => actionStatus === 400 || defaultShouldRevalidate;

export default CacheRoute(Page);
function Page({
  loaderData: data,
  invalidate,
}: ExtendedComponentProps<Route.ComponentProps>) {
  const fetcher = useFetcher<typeof action>();
  return (
    <WithdrawForm
      bals={{
        liq: data.bal_liq,
        lock: data.bal_lock,
      }}
      onSubmit={async (fv) => {
        // a refusal revalidates, and a cached entry would answer it with the stale balance
        await invalidate();
        fetcher.submit(fv, { method: "POST", encType: "application/json" });
      }}
      from="liq"
      is_submitting={fetcher.state !== "idle"}
      error={fetcher.data?.error}
    />
  );
}
