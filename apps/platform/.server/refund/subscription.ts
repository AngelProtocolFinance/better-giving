import { str_id } from "#/helpers/stripe";
import { msg } from "@/queue";
import { enqueue } from "../kit/queue";
import { stripe } from "../kit/stripe";
import { db } from "../pg/db";
import { sub_update } from "../pg/queries/subscription";

/** the subscription whose invoice `intent_id` paid, if any */
export async function subscription_id_of(
  intent_id: string
): Promise<string | null> {
  const { data: ips } = await stripe.invoicePayments.list({
    payment: { payment_intent: intent_id, type: "payment_intent" },
    expand: ["data.invoice"],
  });
  const inv = ips[0]?.invoice;
  const invoice = inv && typeof inv !== "string" && !inv.deleted ? inv : null;
  const sub = invoice?.parent?.subscription_details?.subscription;
  return sub ? str_id(sub) : null;
}

/**
 * stops the billing of the gift whose payment `intent_id` was refunded in
 * full. safe to repeat: only the run that deactivates the row queues the
 * stripe cancel.
 */
export async function cancel_refunded_subscription(intent_id: string) {
  const sub_id = await subscription_id_of(intent_id);
  if (!sub_id) return;
  const { row, prev_status } = await sub_update(db, sub_id, {
    status: "inactive",
    status_cancel_reason: "refunded",
    updated_at: new Date().toISOString(),
  });
  if (row && prev_status === "active") {
    await enqueue(msg("sub-deactivated", row));
  }
}
