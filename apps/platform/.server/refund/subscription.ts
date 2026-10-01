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
 * a full refund of a subscription payment ends the recurring gift, whatever
 * surface issued it (admin page or stripe dashboard). the stripe cancel is
 * queued whenever the row ends up refunded-inactive, not only on the
 * transition, so a retry after a failed enqueue still queues it; the queue's
 * dedupe and the handler's already-ended check make a repeat a no-op.
 */
export async function cancel_refunded_subscription(intent_id: string) {
  const sub_id = await subscription_id_of(intent_id);
  if (!sub_id) return;
  const { row } = await sub_update(db, sub_id, {
    status: "inactive",
    status_cancel_reason: "refunded",
    updated_at: new Date().toISOString(),
  });
  if (row?.status === "inactive" && row.status_cancel_reason === "refunded") {
    await enqueue(msg("sub-deactivated", row));
  }
}
