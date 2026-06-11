import type { ActionFunction } from "react-router";
import * as v from "valibot";
import { redirectWithSuccess } from "#/.server/toast";
import { routes } from "#/pages/admin/routes";
import { new_bank as schema } from "@/banking/schema";
import { resp } from "@/helpers/https";
import * as banking_new from "@/queue/msgs/banking-new";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { bapp_put, npo_bapp_count } from "$/pg/queries/banking";

export const action: ActionFunction = async (args) => {
  const payload = await args.request.json();
  const p = v.safeParse(schema, payload);
  if (p.issues) return resp.status(400, p.issues[0].message);
  const x = p.output;

  const count = await npo_bapp_count(x.endowmentID);
  if (count >= 10) return resp.status(400, "Max 10 payout methods allowed");

  await bapp_put(db, {
    id: x.wiseRecipientID,
    npo_id: x.endowmentID,
    bank_summary: x.bankSummary,
    bank_statement_url: x.bankStatementFile.publicUrl,
    rejection_reason: "",
    status: "under-review",
    date_created: new Date().toISOString(),
  });
  await enqueue(banking_new.to_msg({ npo_id: x.endowmentID }));

  return redirectWithSuccess(
    `../${routes.banking}`,
    "Banking application submitted"
  );
};
