import { donation_transfer_notif } from "@better-giving/react-emails";
import type { ActionFunction } from "react-router";
import * as v from "valibot";
import { get_session } from "#/.server/auth";
import { emails } from "@/constants/common";
import { report_null } from "@/errors/report";
import { send_email } from "$/email";

const stocks_details = v.object({
  ticker: v.string(),
  shares: v.string(),
  amount: v.string(),
});

const ira_qcd_details = v.object({
  amount: v.string(),
  custodian: v.optional(v.string()),
});

// dedup window: ignore identical notifications within 5 minutes
const DEDUP_TTL = 5 * 60 * 1000;
const seen = new Map<string, number>();

const schema = v.variant("type", [
  v.object({
    type: v.literal("stocks"),
    recipient_name: v.string(),
    recipient_url: v.string(),
    details: stocks_details,
  }),
  v.object({
    type: v.literal("ira_qcd"),
    recipient_name: v.string(),
    recipient_url: v.string(),
    details: ira_qcd_details,
  }),
]);

export const action: ActionFunction = async ({ request }) => {
  const body = await request.json();
  const result = v.safeParse(schema, body);
  if (!result.success) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const key = JSON.stringify(result.output);
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUP_TTL) {
    return Response.json({ ok: true });
  }
  seen.set(key, now);

  const { user } = await get_session(request);
  const donor_email = user?.email ?? "Anonymous";
  const data = result.output;

  const { node, subject } = donation_transfer_notif.template({
    type: data.type,
    recipient_name: data.recipient_name,
    recipient_url: data.recipient_url,
    donor_email,
    details: data.details,
  });

  await send_email({ node, subject, to: Object.values(emails) }).catch(
    report_null
  );

  return Response.json({ ok: true });
};
