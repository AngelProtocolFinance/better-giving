import { type ActionFunction, redirect } from "react-router";
import { user_ctx } from "#/.server/auth";
import { verify_recipient } from "#/.server/wise-grant";
import { resp } from "@/helpers/https";
import { user_update } from "$/pg/queries/user";

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);

  const { id, grant } = await request.json().catch(() => ({}) as any);

  // `pay_id` is read straight back as a wise recipient id — by the referrals
  // loader, which renders its `longAccountSummary`, and by the commissions cron,
  // which pays it. so it must be a real id, and one this user actually minted:
  // every recipient sits under one wise profile, so an arbitrary integer here
  // would read out some other applicant's bank account.
  const recipient_id = typeof id === "number" ? id : Number(id);
  if (!Number.isSafeInteger(recipient_id) || recipient_id <= 0) {
    return resp.fail(400, "Invalid payout account");
  }
  if (
    typeof grant !== "string" ||
    !(await verify_recipient(user.id, recipient_id, grant))
  ) {
    return resp.fail(403, "That payout account isn't yours to set");
  }

  try {
    await user_update(user.email, { pay_id: recipient_id.toString() });
  } catch {
    // 500 on purpose — a failed write is ours, and `is_user_error` lets it
    // through to sentry.
    return resp.fail(500, "Could not save your payout account");
  }

  return redirect("../referrals", {
    headers: {
      "x-remix-revalidate": "1",
      "cache-control": "no-cache",
    },
  });
};
