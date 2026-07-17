import * as v from "valibot";
import { redirectWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { bapp_delete } from "$/pg/queries/banking";

export const delete_action = async (x: { params: { bank_id?: string } }) => {
  const p_del = v.safeParse($int_gte1, x.params.bank_id);
  if (p_del.issues) return resp.status(400, p_del.issues[0].message);
  const bank_id = p_del.output;

  await bapp_delete(bank_id.toString());
  return redirectWithSuccess("../..", "Payout method deleted");
};
