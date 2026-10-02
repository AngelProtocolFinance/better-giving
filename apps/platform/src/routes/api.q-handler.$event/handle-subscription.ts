import { PayPalApiError } from "@better-giving/paypal";
import { subscription_cancel_failed } from "emails";
import { href } from "react-router";
import Stripe from "stripe";
import { report_error } from "#/errors/report";
import { to_amount } from "@/helpers/email";
import type { IAttempt, ISubDeactivatedPayload } from "@/queue";
import type { ISub } from "@/subscriptions";
import { send_email } from "$/email";
import { base_url } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { paypal } from "$/kit/paypal";
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

/** `send_email` reports its own refusal; a render throw reaches the rejection handler below */
async function email_cancel_failed(row: ISub): Promise<boolean> {
  const { node, subject } = subscription_cancel_failed.template({
    to_name: row.to_name,
    amount: to_amount(row.amount, row.amount_usd, row.currency.toUpperCase()),
    interval: row.interval,
    interval_count: row.interval_count,
    subscriptions_url: new URL(
      href("/dashboard/subscriptions"),
      base_url
    ).toString(),
  });
  return send_email({ node, subject, to: [row.from_id] }).then(
    (res) => res.data !== null,
    (err) => {
      report_error(err, { sub_id: row.id });
      return false;
    }
  );
}

/** ended at stripe, where a cancel call errors; a retried or re-queued cancel can find its sub in one */
const STRIPE_ENDED = new Set(["canceled", "incomplete_expired"]);
/** the paypal states that still bill, or can again */
const PAYPAL_LIVE = new Set(["ACTIVE", "SUSPENDED"]);

async function still_billing(data: ISubDeactivatedPayload): Promise<boolean> {
  if (data.platform === "stripe") {
    const live = await stripe.subscriptions.retrieve(data.id);
    return !STRIPE_ENDED.has(live.status);
  }
  const live = await paypal.get_subscription(data.id);
  return PAYPAL_LIVE.has(live.status ?? "");
}

/**
 * the donor was shown their cancel as done: while the provider still bills it,
 * the row goes back to active and the donor is told. returns what happened, for ops.
 */
async function undo_donor_cancel(data: ISubDeactivatedPayload) {
  const unchanged = "its row was left cancelled and the donor was not emailed";
  if (!data.by_donor || !data.status_cancel_reason) {
    return "The donor sees this subscription as cancelled and may still be charged.";
  }

  // a refusal alone doesn't say it still bills: a 404 leaves nothing to
  // charge, and a 5xx past the last retry may have cancelled after all
  let live: boolean;
  try {
    live = await still_billing(data);
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return `Reading it live from ${data.platform} failed, so ${unchanged}; it may still be charged.`;
  }
  if (!live)
    return `It has already ended at ${data.platform}, so ${unchanged}.`;

  let changed: boolean;
  try {
    // only while the row still carries the donor's cancel: a refund that
    // landed since rewrote the reason and wins
    changed = await sub_reactivate_if(db, data.id, data.status_cancel_reason);
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return "Restoring its row failed: the donor sees this subscription as cancelled and may still be charged.";
  }

  const restored = "Its row was restored to active";
  try {
    const row = await sub_get(data.id);
    if (!changed) {
      // an earlier delivery or a provider webhook made it active, or a
      // refund rewrote the reason
      return row?.status === "active"
        ? "Its row was already active — the donor may not have been emailed by this delivery."
        : "Its row has changed since the donor's cancel, so it was left as is and the donor was not emailed.";
    }
    if (!row?.from_id) {
      return `${restored}, but it has no donor email address, so the donor was not told.`;
    }
    return (await email_cancel_failed(row))
      ? `${restored} and the donor was emailed that the cancel didn't go through.`
      : `${restored}, but the email telling the donor failed: they still see it as cancelled.`;
  } catch (err) {
    report_error(err, { sub_id: data.id });
    return changed
      ? `${restored}, but telling the donor failed: they still see it as cancelled.`
      : "Reading its row back failed.";
  }
}

/**
 * someone has to cancel it by hand. answered as handled — a redelivery can
 * only repeat the refusal into the dlq.
 */
async function alert_cancel_failed(
  data: ISubDeactivatedPayload,
  err: unknown,
  reason: string | number
) {
  report_error(err, { sub_id: data.id, platform: data.platform });
  const outcome = await undo_donor_cancel(data);
  await fiat_monitor
    .send_alert({
      type: "ERROR",
      from: "sub-deactivated",
      title: `${data.platform} refused to cancel subscription ${data.id}`,
      body: `${data.platform} answered ${reason}. ${outcome} Cancel ${data.id} in the ${data.platform} dashboard.`,
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
