import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithError, redirectWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { bapp_delete, bapp_get, bapps_by_status } from "$/pg/queries/banking";

type TArgs = Pick<
  LoaderFunctionArgs | ActionFunctionArgs,
  "params" | "context"
>;

const own_bapp = async (x: TArgs) => {
  const p = v.safeParse($int_gte1, x.params.bank_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const npo_id = x.context.get(admin_ctx);
  const ba = await bapp_get(p.output.toString());
  return ba && ba.npo_id === npo_id ? ba : undefined;
};

/** the default can't go while another approved method could take its place */
const is_guarded_default = async (ba: { status: string; npo_id: number }) => {
  if (ba.status !== "default") return false;
  const heirs = await bapps_by_status("approved", {
    npo_id: ba.npo_id,
    limit: 1,
  });
  return heirs.items.length > 0;
};

export const delete_loader = async (x: TArgs) => {
  const ba = await own_bapp(x);
  if (!ba) throw resp.status(404);
  return {
    is_default: ba.status === "default",
    is_guarded: await is_guarded_default(ba),
  };
};

export const delete_action = async (x: TArgs) => {
  const ba = await own_bapp(x);
  if (!ba) return dataWithError(null, "Payout method not found");

  if (await is_guarded_default(ba)) {
    return dataWithError(
      null,
      "Kindly set another payout method as default before deleting"
    );
  }

  const deleted = await bapp_delete(ba.id, ba.npo_id);
  if (!deleted) return dataWithError(null, "Payout method not found");
  return redirectWithSuccess("../..", "Payout method deleted");
};
