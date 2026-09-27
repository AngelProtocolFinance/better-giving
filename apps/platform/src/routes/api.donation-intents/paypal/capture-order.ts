import { report_error } from "#/errors/report";
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
    // paypal has already taken the money: failing the response here tells the
    // donor it didn't, and they pay again. the capture webhook re-writes these
    // details only when paypal returns an email, so a venmo / email-withheld
    // payer's name and address are lost on this failure — reported as an
    // error, not a degrade, because that is data loss.
    await donation_update(db, don_id, update).catch((err) =>
      report_error(err, { don_id, order_id })
    );
  }

  return capture;
};
