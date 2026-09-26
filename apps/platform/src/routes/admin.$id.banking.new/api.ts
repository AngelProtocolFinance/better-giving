import type { ActionFunction } from "react-router";
import * as v from "valibot";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import { routes } from "#/pages/admin/routes";
import { new_bank as schema } from "@/banking/schema";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { bapp_put, npo_bapp_count } from "$/pg/queries/banking";

export const action: ActionFunction = async (args) => {
  const payload = await args.request.json();
  const p = v.safeParse(schema, payload);
  if (p.issues) return resp.fail(400, p.issues[0].message);
  const x = p.output;
  // `npo_admin_mdlwr` vouches for the url's npo only; the body's id is the client's say-so
  const npo_id = args.context.get(admin_ctx);
  if (x.endowmentID !== npo_id)
    return resp.fail(
      403,
      "A payout method can only be added to your own nonprofit"
    );

  const count = await npo_bapp_count(npo_id);
  if (count >= 10) return resp.fail(400, "Max 10 payout methods allowed");

  await bapp_put(db, {
    id: x.wiseRecipientID,
    npo_id,
    bank_summary: x.bankSummary,
    bank_statement_url: x.bankStatementFile.publicUrl,
    rejection_reason: "",
    status: "under-review",
    date_created: new Date().toISOString(),
  });
  await enqueue(msg("banking-new", { npo_id }));

  return redirectWithSuccess(
    `../${routes.banking}`,
    "Banking application submitted"
  );
};
