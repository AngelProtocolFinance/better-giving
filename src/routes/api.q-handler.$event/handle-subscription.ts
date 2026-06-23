import type { ISubDeactivatedPayload } from "@/queue";
import { paypal } from "$/kit/paypal";
import { stripe } from "$/kit/stripe";

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
      reason: data.status_cancel_reason ?? "no reason provided",
    });
    console.info(`subscription ${data.id} cancelled on paypal`);
  }
}
