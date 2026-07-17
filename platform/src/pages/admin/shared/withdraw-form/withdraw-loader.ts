import type { LoaderFunctionArgs } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { nav_ltd } from "$/pg/queries/nav";
import { npo_get } from "$/pg/queries/npo";

export interface LoaderData {
  id: number;
  bal_lock: number;
  bal_liq: number;
}

export const withdraw_loader = async (x: LoaderFunctionArgs) => {
  const id = x.context.get(admin_ctx);

  const [ltd, npo] = await Promise.all([nav_ltd(), npo_get(id)]);

  return {
    id,
    bal_lock: (npo?.lock_units ?? 0) * ltd.price,
    bal_liq: npo?.liq ?? 0,
  } satisfies LoaderData;
};
