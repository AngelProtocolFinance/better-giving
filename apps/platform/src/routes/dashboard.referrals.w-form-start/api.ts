import { redirect } from "react-router";
import { user_ctx } from "#/.server/auth";
import { weld_data_create, weld_fn } from "#/.server/registration/weld-data";
import { resp } from "@/helpers/https";
import { user_w_form_weld_eid_set } from "$/pg/queries/user";
import type { Route } from "./+types/route";

// the two welds a signer can be sent to. the posted value only picks one out of
// this list — the slug anvil is asked for is the literal from here, never the
// request's own string.
const weld_slugs = ["irs-w9", "fw8ben"] as const;

export const action = async ({ request, context }: Route.ActionArgs) => {
  const user = context.get(user_ctx);
  const fv = await request.formData();
  const slug = weld_slugs.find((s) => s === fv.get("tax_form"));
  if (!slug) throw resp.status(400, "unknown tax form");

  const weld = await weld_fn(slug);
  const weld_data = await weld_data_create(weld.eid);

  // recorded before the signer can reach the form, so the callback has
  // something to verify against. the reverse order would leave a completed
  // submission nobody owns — and the callback refuses those.
  await user_w_form_weld_eid_set(user.email, weld_data.eid);

  return redirect(weld_data.continueURL);
};
