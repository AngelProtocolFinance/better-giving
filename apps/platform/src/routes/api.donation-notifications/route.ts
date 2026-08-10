import { donation_transfer_notif } from "emails";
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

// best-effort, per-instance guard — not a global 5-minute dedup window. the app
// deploys as vercel serverless functions, so every concurrent instance holds
// its own map: this only collapses a rapid double-submit that lands on the same
// warm instance, and a retry routed to another instance still sends a
// duplicate. accepted trade-off — these notifications go to the internal team,
// so an occasional duplicate is cheaper than a shared store on this path.
const DEDUP_TTL = 5 * 60 * 1000;
// exported for tests
export const seen = new Map<string, number>();

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
  // prune on write so a long-lived warm instance's map doesn't grow with every
  // notification it has ever seen. age-based only — it reclaims keys once the
  // window passes, not against a burst of distinct payloads inside one window.
  for (const [k, t] of seen) {
    if (now - t >= DEDUP_TTL) seen.delete(k);
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
