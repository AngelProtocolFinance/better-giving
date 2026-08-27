import { paypal_donor_update } from "@/donations/helpers";
import { paypal } from "$/kit/paypal";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

interface ICaptureInput {
  order_id: string;
  don_id: string;
}

export const capture_order = async ({ order_id, don_id }: ICaptureInput) => {
  // order_id is stable per intent — use it as the idempotency key so a retry
  // after a timeout returns the original capture instead of duplicating it
  const capture = await paypal.capture_order(order_id, `capture-${order_id}`);

  const ps = capture.payment_source?.paypal || capture.payment_source?.venmo;
  // not gated on the email: a payment source can report a payer name or
  // address without one — venmo, and a paypal account whose email is withheld
  const update = ps ? paypal_donor_update(ps) : {};
  if (Object.keys(update).length > 0) {
    await donation_update(db, don_id, update);
  }

  return capture;
};
