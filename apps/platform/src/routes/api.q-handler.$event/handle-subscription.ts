import { PayPalApiError } from "@better-giving/paypal";
import Stripe from "stripe";
import { report_error } from "#/errors/report";
import type { ISubDeactivatedPayload } from "@/queue";
import { fiat_monitor } from "$/kit/discord";
import { paypal } from "$/kit/paypal";
import { stripe } from "$/kit/stripe";

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

/**
 * the donor was already shown the subscription as cancelled, and the provider
 * may still charge it: someone has to cancel it by hand. answered as handled —
 * a redelivery can only repeat the refusal into the dlq.
 */
async function alert_cancel_failed(
  data: ISubDeactivatedPayload,
  err: unknown,
  reason: string | number
) {
  report_error(err, { sub_id: data.id, platform: data.platform });
  await fiat_monitor
    .send_alert({
      type: "ERROR",
      from: "sub-deactivated",
      title: `${data.platform} refused to cancel subscription ${data.id}`,
      body: `${data.platform} answered ${reason}. The donor sees this subscription as cancelled and may still be charged. Cancel ${data.id} in the ${data.platform} dashboard.`,
    })
    .catch((e) => report_error(e, { sub_id: data.id }));
}

/** ended at stripe, where a cancel call errors; a retried or re-queued cancel can find its sub in one */
const STRIPE_ENDED = new Set(["canceled", "incomplete_expired"]);

async function cancel_on_stripe(data: ISubDeactivatedPayload) {
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
    if (!is_final_refusal(err.statusCode ?? 0)) throw err;
    return alert_cancel_failed(data, err, err.code ?? err.statusCode ?? "");
  }
  console.info(`subscription ${data.id} cancelled on stripe`);
}

async function cancel_on_paypal(data: ISubDeactivatedPayload) {
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
    if (!is_final_refusal(err.http_status)) throw err;
    return alert_cancel_failed(data, err, issues.join(",") || err.http_status);
  }
  console.info(`subscription ${data.id} cancelled on paypal`);
}

export async function handle_sub_deactivated(data: ISubDeactivatedPayload) {
  if (data.platform === "stripe") await cancel_on_stripe(data);
  else if (data.platform === "paypal") await cancel_on_paypal(data);
}
