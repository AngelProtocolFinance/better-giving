import { PayPalApiError } from "@better-giving/paypal";
import { subscription_cancel_failed } from "emails";
import { href } from "react-router";
import Stripe from "stripe";
import { report_error } from "#/errors/report";
import { to_amount } from "@/helpers/email";
import {
  type IAttempt,
  type ISubCancelFailedEmailPayload,
  type ISubDeactivatedPayload,
  msg,
} from "@/queue";
import type { ISub } from "@/subscriptions";
import { send_email_or_throw } from "$/email";
import { base_url } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { paypal } from "$/kit/paypal";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { sub_get, sub_reactivate_if } from "$/pg/queries/subscription";

const PAYPAL_CANCEL_REASON_MAX_BYTES = 128;
/** stripe's `cancellation_details.comment` maxLength */
const STRIPE_CANCEL_COMMENT_MAX = 5000;

const utf8 = new TextEncoder();
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * capped in utf-8 bytes: never fewer than code units or code points, so it holds under whichever count the provider uses;
 * cut on a grapheme boundary so no flag, emoji or combining accent is split.
 */
const cap_utf8 = (text: string, max_bytes: number): string => {
  let capped = "";
  let bytes = 0;
  for (const { segment } of graphemes.segment(text)) {
    bytes += utf8.encode(segment).length;
    if (bytes > max_bytes) break;
    capped += segment;
  }
  return capped.trimEnd();
};

/** paypal's spec: 1-128 chars matching `^.*$` — no line breaks (`\u0085` too, which js `\s` misses). */
const paypal_cancel_reason = (reason: string | null | undefined): string => {
  const one_line = (reason ?? "").replace(/[\s\u0085]+/g, " ").trim();
  return (
    cap_utf8(one_line, PAYPAL_CANCEL_REASON_MAX_BYTES) || "no reason provided"
  );
};

const paypal_issues = (body: string): string[] => {
  try {
    const { details } = JSON.parse(body) as { details?: { issue?: string }[] };
    return (details ?? []).flatMap((d) => (d.issue ? [d.issue] : []));
  } catch {
    return [];
  }
};

/** a 4xx a retry can't change: not a timeout (408), a concurrent-update
 * conflict (409) or a rate limit (429) */
const RETRYABLE_4XX = new Set([408, 409, 429]);
const is_final_refusal = (http_status: number) =>
  http_status >= 400 && http_status < 500 && !RETRYABLE_4XX.has(http_status);

/** its own message, so the queue retries a failed send: the row is already restored */
async function queue_cancel_failed_email(
  row: ISub,
  cancelled_at: string
): Promise<boolean> {
  const payload: ISubCancelFailedEmailPayload = {
    id: row.id,
    cancelled_at,
    to: row.from_id,
    to_name: row.to_name,
    amount: row.amount,
    amount_usd: row.amount_usd,
    currency: row.currency,
    interval: row.interval,
    interval_count: row.interval_count,
  };
  return enqueue(msg("sub-cancel-failed-email", payload)).then(
    () => true,
    (err) => {
      report_error(err, { sub_id: row.id });
      return false;
    }
  );
}

export async function handle_sub_cancel_failed_email(
  p: ISubCancelFailedEmailPayload
) {
  // a retry can land after the donor cancelled again or a refund ended it,
  // when "it still bills" is no longer true; the restore clears
  // cancel_requested_at, so a set one is a newer cancel
  const row = await sub_get(p.id);
  if (row?.status !== "active" || row.cancel_requested_at) {
    console.info(
      `subscription ${p.id} changed since its refused cancel; cancel-failed email not sent`
    );
    return;
  }
  const { node, subject } = subscription_cancel_failed.template({
    to_name: p.to_name,
    amount: to_amount(p.amount, p.amount_usd, p.currency.toUpperCase()),
    interval: p.interval,
    interval_count: p.interval_count,
    subscriptions_url: new URL(
      href("/dashboard/subscriptions"),
      base_url
    ).toString(),
  });
  await send_email_or_throw({ node, subject, to: [p.to] });
  console.info(`subscription ${p.id} cancel-failed email sent`);
}

/** ended at stripe, where a cancel call errors; a retried or re-queued cancel can find its sub in one */
const STRIPE_ENDED: Set<Stripe.Subscription.Status> = new Set([
  "canceled",
  "incomplete_expired",
]);
/** unpaid and paused generate no charged invoice; incomplete's first payment never cleared */
const STRIPE_BILLING: Set<Stripe.Subscription.Status> = new Set([
  "active",
  "past_due",
  "trialing",
]);

const is_not_found = (err: unknown) =>
  (err instanceof Stripe.errors.StripeError &&
    err.code === "resource_missing") ||
  (err instanceof PayPalApiError && err.http_status === 404);

interface ILiveRead {
  billing: boolean;
  status: string;
}

/** a provider with no record of the subscription bills nothing */
async function read_live(data: ISubDeactivatedPayload): Promise<ILiveRead> {
  try {
    if (data.platform === "stripe") {
      const { status } = await stripe.subscriptions.retrieve(data.id);
      return { billing: STRIPE_BILLING.has(status), status };
    }
    // SUSPENDED bills nothing until reactivated, and our webhook maps it inactive
    const { status = "no status" } = await paypal.get_subscription(data.id);
    return { billing: status === "ACTIVE", status };
  } catch (err) {
    if (is_not_found(err)) return { billing: false, status: "not found" };
    throw err;
  }
}

interface IOutcome {
  text: string;
  /** false once the provider is known to bill nothing */
  cancel_by_hand: boolean;
}
const by_hand = (text: string): IOutcome => ({ text, cancel_by_hand: true });

/**
 * the donor was shown their cancel as done: while the provider still bills it,
 * the row goes back to active and the donor is told. returns what happened, for ops.
 */
async function undo_donor_cancel(
  data: ISubDeactivatedPayload
): Promise<IOutcome> {
  const unchanged = "its row was left cancelled and the donor was not emailed";
  if (!data.by_donor || !data.status_cancel_reason) {
    return by_hand(
      "The donor sees this subscription as cancelled and may still be charged."
    );
  }

  // a refusal alone doesn't say it still bills: a 404 leaves nothing to
  // charge, and a 5xx past the last retry may have cancelled after all
  let live: ILiveRead;
  try {
    live = await read_live(data);
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return by_hand(
      `Reading it live from ${data.platform} failed, so ${unchanged}; it may still be charged.`
    );
  }
  if (!live.billing) {
    return {
      text: `It isn't billing at ${data.platform} (${live.status}), so ${unchanged}.`,
      cancel_by_hand: false,
    };
  }

  let changed: boolean;
  try {
    // only while the row still carries this cancel: a refund that landed
    // since rewrote the reason, and a later cancel restamped the row
    changed = await sub_reactivate_if(
      db,
      data.id,
      data.status_cancel_reason,
      data.cancel_requested_at
    );
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return by_hand(
      "Restoring its row failed: the donor sees this subscription as cancelled and may still be charged."
    );
  }

  const restored = "Its row was restored to active";
  try {
    const row = await sub_get(data.id);
    if (!changed) {
      // an earlier delivery or a provider webhook made it active, or a
      // refund rewrote the reason
      return by_hand(
        row?.status === "active"
          ? "Its row was already active — the donor may not have been emailed by this delivery."
          : "Its row has changed since the donor's cancel, so it was left as is and the donor was not emailed."
      );
    }
    if (!row?.from_id) {
      return by_hand(
        `${restored}, but it has no donor email address, so the donor was not told.`
      );
    }
    return by_hand(
      (await queue_cancel_failed_email(row, data.cancel_requested_at))
        ? `${restored}; the donor's email was queued to tell them the cancel didn't go through.`
        : `${restored}, but queueing the donor's email failed: they still see it as cancelled.`
    );
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return by_hand(
      changed
        ? `${restored}, but telling the donor failed: they still see it as cancelled.`
        : "Reading its row back failed."
    );
  }
}

/**
 * ops is told what became of it, and to cancel it by hand unless the provider
 * bills nothing. answered as handled — a redelivery can only repeat the
 * refusal into the dlq.
 */
async function alert_cancel_failed(
  data: ISubDeactivatedPayload,
  err: unknown,
  reason: string | number
) {
  report_error(err, { sub_id: data.id, platform: data.platform });
  const { text, cancel_by_hand } = await undo_donor_cancel(data);
  const instruction = cancel_by_hand
    ? ` Cancel ${data.id} in the ${data.platform} dashboard.`
    : "";
  await fiat_monitor
    .send_alert({
      type: "ERROR",
      from: "sub-deactivated",
      title: `${data.platform} refused to cancel subscription ${data.id}`,
      body: `${data.platform} answered ${reason}. ${text}${instruction}`,
    })
    .catch((e) => report_error(e, { sub_id: data.id }));
}

async function cancel_on_stripe(
  data: ISubDeactivatedPayload,
  attempt: IAttempt
) {
  try {
    const live = await stripe.subscriptions.retrieve(data.id);
    if (STRIPE_ENDED.has(live.status)) {
      console.info(`subscription ${data.id} already ${live.status} on stripe`);
      return;
    }
    await stripe.subscriptions.cancel(data.id, {
      cancellation_details: {
        comment: data.status_cancel_reason
          ? cap_utf8(data.status_cancel_reason, STRIPE_CANCEL_COMMENT_MAX)
          : undefined,
      },
    });
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    // a retryable refusal on the last attempt is final too: escalate it
    if (!is_final_refusal(err.statusCode ?? 0) && !attempt.last) throw err;
    return alert_cancel_failed(data, err, err.code ?? err.statusCode ?? "");
  }
  console.info(`subscription ${data.id} cancelled on stripe`);
}

async function cancel_on_paypal(
  data: ISubDeactivatedPayload,
  attempt: IAttempt
) {
  try {
    await paypal.cancel_subscription(data.id, {
      reason: paypal_cancel_reason(data.status_cancel_reason),
    });
  } catch (err) {
    if (!(err instanceof PayPalApiError)) throw err;
    const issues = paypal_issues(err.body);
    // status is neither ACTIVE nor SUSPENDED (already CANCELLED, EXPIRED, or
    // still APPROVAL_PENDING/APPROVED); our rows only exist once it went ACTIVE
    if (
      err.http_status === 422 &&
      issues.includes("SUBSCRIPTION_STATUS_INVALID")
    ) {
      console.info(`subscription ${data.id} not active on paypal`);
      return;
    }
    if (!is_final_refusal(err.http_status) && !attempt.last) throw err;
    return alert_cancel_failed(data, err, issues.join(",") || err.http_status);
  }
  console.info(`subscription ${data.id} cancelled on paypal`);
}

export async function handle_sub_deactivated(
  data: ISubDeactivatedPayload,
  attempt: IAttempt = { last: false }
) {
  if (data.platform === "stripe") await cancel_on_stripe(data, attempt);
  else if (data.platform === "paypal") await cancel_on_paypal(data, attempt);
}
