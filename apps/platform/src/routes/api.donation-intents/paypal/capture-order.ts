import {
  type CaptureOrderResponse,
  PayPalApiError,
} from "@better-giving/paypal";
import { report_degraded, report_error } from "#/errors/report";
import { paypal_donor_update } from "@/donations/helpers";
import {
  type IPaypalCaptured,
  paypal_capture_outcome,
} from "@/donations/paypal-capture";
import { resp } from "@/helpers/https";
import { paypal } from "$/kit/paypal";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

interface ICaptureInput {
  order_id: string;
  don_id: string;
}

/** orders.capture-422 issues that mean paypal refused the payer's funding — nothing was taken */
const REFUSED_ISSUES = new Set([
  "INSTRUMENT_DECLINED",
  "PAYER_ACTION_REQUIRED",
]);

// the sdk flattens a non-2xx into `Failed to capture order: <status> <body>`.
// anything that doesn't parse to a refused issue stays a thrown unknown.
const refused_issue = (err: unknown): string | undefined => {
  if (!(err instanceof Error)) return;
  const m = /^Failed to capture order: 422 (\{.*\})$/s.exec(err.message);
  if (!m?.[1]) return;
  try {
    const { details } = JSON.parse(m[1]) as { details?: { issue?: string }[] };
    return details?.find((d) => d.issue && REFUSED_ISSUES.has(d.issue))?.issue;
  } catch {
    return;
  }
};

const already_captured = (err: unknown): boolean =>
  err instanceof PayPalApiError &&
  err.http_status === 422 &&
  err.body.includes('"ORDER_ALREADY_CAPTURED"');

/** not a paypal resource: the least the browser's `paypal_capture_outcome` reads as declined */
const REFUSED_CAPTURE: IPaypalCaptured = {
  purchase_units: [{ payments: { captures: [{ status: "DECLINED" }] } }],
};

export const capture_order = async ({
  order_id,
  don_id,
}: ICaptureInput): Promise<CaptureOrderResponse | IPaypalCaptured> => {
  let capture: CaptureOrderResponse;
  try {
    // order_id is stable per intent — use it as the idempotency key so a retry
    // after a timeout returns the original capture instead of duplicating it
    capture = await paypal.capture_order(order_id, `capture-${order_id}`);
  } catch (err) {
    const issue = refused_issue(err);
    if (issue) {
      report_degraded(err, { order_id, don_id, issue });
      return REFUSED_CAPTURE;
    }
    if (!already_captured(err)) throw err;
    // the webhook's delayed fallback captured it while the donor was away;
    // the order carries that capture
    capture = await paypal.get_order(order_id);
  }

  // don_id is the browser's word, custom_id is ours from create time. don ids
  // appear in thank-you urls, so a mismatch would write onto another receipt,
  // or hand a declined capture's payer details to whoever named it
  if (capture.purchase_units?.[0]?.custom_id !== don_id) {
    report_degraded(new Error("paypal capture for another donation"), {
      order_id,
      don_id,
    });
    throw resp.status(400, "order is not for this donation");
  }

  const { outcome, status } = paypal_capture_outcome(capture);
  if (outcome !== "taken") {
    // the donor is told in the browser; this is the only server-side trace
    report_degraded(new Error(`paypal capture ${status}`), {
      order_id,
      don_id,
      status,
    });
  }
  if (outcome === "declined") return capture;

  const ps = capture.payment_source?.paypal || capture.payment_source?.venmo;
  // not gated on the email: a payment source can report a payer name or
  // address without one — venmo, and a paypal account whose email is withheld
  const update = ps ? paypal_donor_update(ps) : {};
  if (Object.keys(update).length > 0) {
    // paypal has already taken the money: failing the response here tells the
    // donor it didn't, and they pay again. the capture webhook re-writes these
    // details only when paypal returns an email, so a venmo / email-withheld
    // payer's name and address are lost on this failure — data loss, so an
    // error rather than a degrade.
    await donation_update(db, don_id, update).catch((err) =>
      report_error(err, { don_id, order_id })
    );
  }

  return capture;
};
