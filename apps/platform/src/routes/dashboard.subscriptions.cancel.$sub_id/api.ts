import { data } from "react-router";
import { safeParse } from "valibot";
import { user_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import { msg } from "@/queue";
import { FIRST_PAYMENT_INCOMPLETE } from "@/subscriptions";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { sub_get, sub_update } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";
import { cancel_fv } from "./schema";

const is_donor = (sub: { from_id: string }, email: string) =>
  sub.from_id.toLowerCase() === email.toLowerCase();

export const loader = async ({ context, params }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const sub = await sub_get(params.sub_id);
  if (!sub || !is_donor(sub, user.email)) {
    throw data("Not found", { status: 404 });
  }
  return { recipient_name: sub.to_name };
};

export const action = async ({
  context,
  request,
  params,
}: Route.ActionArgs) => {
  const user = context.get(user_ctx);
  const existing = await sub_get(params.sub_id);
  if (!existing || !is_donor(existing, user.email)) {
    throw data("Not found", { status: 404 });
  }
  const body = await request.json().catch(() => {
    throw data("Malformed body", { status: 400 });
  });
  const fv = safeParse(cancel_fv, body);
  if (!fv.success) throw data(fv.issues[0].message, { status: 400 });
  const { reason } = fv.output;
  const cancel_requested_at = new Date().toISOString();
  const { row, prev_status } = await sub_update(db, params.sub_id, {
    status: "inactive",
    status_cancel_reason: reason,
    cancel_requested_at,
  });
  // an incomplete gift can still be paid at stripe, so it is live there too
  const live_at_stripe =
    prev_status === "active" ||
    existing.status_cancel_reason === FIRST_PAYMENT_INCOMPLETE;
  if (row && live_at_stripe) {
    await enqueue(
      msg("sub-deactivated", { ...row, by_donor: true, cancel_requested_at })
    );
  }
  return redirectWithSuccess("..", "Subscription cancelled");
};
