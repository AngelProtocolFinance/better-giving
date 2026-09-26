import type { ISubDeactivatedPayload } from "@/queue";
import { paypal } from "$/kit/paypal";
import { stripe } from "$/kit/stripe";

const PAYPAL_CANCEL_REASON_MAX_BYTES = 128;

const utf8 = new TextEncoder();
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * paypal's spec: 1-128 chars matching `^.*$` — no line breaks (`\u0085` too, which js `\s` misses).
 * capped in utf-8 bytes: never fewer than code units or code points, so it holds under whichever count paypal uses;
 * cut on a grapheme boundary so no flag, emoji or combining accent is split.
 */
const paypal_cancel_reason = (reason: string | null | undefined): string => {
  const one_line = (reason ?? "").replace(/[\s\u0085]+/g, " ").trim();
  let capped = "";
  let bytes = 0;
  for (const { segment } of graphemes.segment(one_line)) {
    bytes += utf8.encode(segment).length;
    if (bytes > PAYPAL_CANCEL_REASON_MAX_BYTES) break;
    capped += segment;
  }
  return capped.trimEnd() || "no reason provided";
};

/** ended at stripe, where a cancel call errors; a retried or re-queued cancel can find its sub in one */
const STRIPE_ENDED = new Set(["canceled", "incomplete_expired"]);

export async function handle_sub_deactivated(data: ISubDeactivatedPayload) {
  if (data.platform === "stripe") {
    const live = await stripe.subscriptions.retrieve(data.id);
    if (STRIPE_ENDED.has(live.status)) {
      console.info(`subscription ${data.id} already ${live.status} on stripe`);
      return;
    }
    await stripe.subscriptions.cancel(data.id, {
      cancellation_details: {
        comment: data.status_cancel_reason ?? undefined,
      },
    });
    console.info(`subscription ${data.id} cancelled on stripe`);
  } else if (data.platform === "paypal") {
    await paypal.cancel_subscription(data.id, {
      reason: paypal_cancel_reason(data.status_cancel_reason),
    });
    console.info(`subscription ${data.id} cancelled on paypal`);
  }
}
