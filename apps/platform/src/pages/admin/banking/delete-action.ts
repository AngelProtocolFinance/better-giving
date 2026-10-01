import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithError, redirectWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { bapp_delete, bapp_get, bapps_by_status } from "$/pg/queries/banking";

export const delete_action = async (
  x: Pick<ActionFunctionArgs, "params" | "context">
) => {
  const p_del = v.safeParse($int_gte1, x.params.bank_id);
  if (p_del.issues) throw resp.status(400, p_del.issues[0].message);
  const bank_id = p_del.output;
  const npo_id = x.context.get(admin_ctx);

  const ba = await bapp_get(bank_id.toString());
  if (!ba || ba.npo_id !== npo_id) {
    return dataWithError(null, "Payout method not found");
  }

  if (ba.status === "default") {
    const heirs = await bapps_by_status("approved", { npo_id, limit: 1 });
    if (heirs.items.length > 0) {
      return dataWithError(
        null,
        "Kindly set another payout method as default before deleting",
        { status: 409 }
      );
    }
  }

  const deleted = await bapp_delete(bank_id.toString(), npo_id);
  if (!deleted) return dataWithError(null, "Payout method not found");
  return redirectWithSuccess("../..", "Payout method deleted");
};
