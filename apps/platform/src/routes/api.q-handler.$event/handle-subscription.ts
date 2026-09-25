import type { ISubDeactivatedPayload } from "@/queue";
import { paypal } from "$/kit/paypal";
import { stripe } from "$/kit/stripe";

const PAYPAL_CANCEL_REASON_MAX = 128;

/** paypal's spec: 1-128 chars matching `^.*$` — no line breaks (`\u0085` too, which js `\s` misses) */
const paypal_cancel_reason = (reason: string | null | undefined): string => {
  const one_line = (reason ?? "").replace(/[\s\u0085]+/g, " ").trim();
  let capped = "";
  // by code point, so the cut never leaves half a surrogate pair
  for (const ch of one_line) {
    if (capped.length + ch.length > PAYPAL_CANCEL_REASON_MAX) break;
    capped += ch;
  }
  return capped.trimEnd() || "no reason provided";
};

export async function handle_sub_deactivated(data: ISubDeactivatedPayload) {
  if (data.platform === "stripe") {
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
