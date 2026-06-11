import * as v from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import * as banking_default from "@/queue/msgs/banking-default";
import { $int_gte1 } from "@/schemas";
import { enqueue } from "$/kit/queue";
import { wise } from "$/kit/wise";
import { bapp_get, bapp_set_default } from "$/pg/queries/banking";
import type { Route } from "./+types/route";

export const loader = async (args: Route.LoaderArgs) => {
  const p = v.safeParse($int_gte1, args.params.bank_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const bank_id = p.output;
  const npo_id = args.context.get(admin_ctx);

  const x = await bapp_get(bank_id.toString());
  if (!x || x.npo_id !== npo_id) return resp.status(404);

  const y = await wise.v2_account(bank_id);
  return { ...y, ba: x };
};

export { delete_action } from "#/pages/admin/banking/delete-action";

export const default_action = async (args: Route.ActionArgs) => {
  const p_id = v.safeParse($int_gte1, args.params.bank_id);
  if (p_id.issues) return resp.status(400, p_id.issues[0].message);
  const bank_id = p_id.output;
  const npo_id = args.context.get(admin_ctx);

  const x = await bapp_get(bank_id.toString());
  if (!x) return { status: 404, statusText: `Bank:${bank_id} not found` };

  await bapp_set_default(bank_id.toString(), npo_id);
  await enqueue(banking_default.to_msg({ npo_id }));
  return dataWithSuccess(null, "Payout method set as default");
};
