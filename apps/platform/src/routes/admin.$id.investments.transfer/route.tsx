import { type ShouldRevalidateFunction, useFetcher } from "react-router";
import {
  CacheRoute,
  createClientLoaderCache,
  type ExtendedComponentProps,
} from "remix-client-cache";
import { TransferForm } from "#/pages/admin/shared/transfer-form";
import { transfer_action } from "#/pages/admin/shared/transfer-form/transfer-action";
import type { Route } from "./+types/route";

export { transfer_loader as loader } from "#/pages/admin/shared/transfer-form/transfer-loader";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = transfer_action({
  liq: "../../savings",
  lock: "../../investments",
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
    <TransferForm
      bals={{
        liq: data.bal_liq,
        lock: data.bal_lock,
      }}
      onSubmit={async (fv) => {
        // a refusal revalidates, and a cached entry would answer it with the stale balance
        await invalidate();
        fetcher.submit(fv, { method: "POST", encType: "application/json" });
      }}
      from="lock"
      is_submitting={fetcher.state !== "idle"}
      error={fetcher.data?.error}
    />
  );
}
