import { PayPalApiError } from "@better-giving/paypal";
import { report_degraded } from "#/errors/report";
import type { IPaypalOrderCapturePayload } from "@/queue";
import { paypal } from "$/kit/paypal";

const issues_of = (e: PayPalApiError): string[] => {
  try {
    const { details } = JSON.parse(e.body) as {
      details?: { issue?: string }[];
    };
    return details?.flatMap((d) => (d.issue ? [d.issue] : [])) ?? [];
  } catch {
    return [];
  }
};

/** a 422 saying paypal refused the payer's funding: nothing was taken */
const FUNDING_REFUSED = new Set([
  "INSTRUMENT_DECLINED",
  "PAYER_ACTION_REQUIRED",
]);

/**
 * the fallback capture for an approval whose browser never captured — a closed
 * tab, a dropped network. only an order paypal still shows APPROVED is
 * captured, under the browser's own request id, so a capture the browser made
 * is returned rather than repeated. the capture's own webhook events settle or
 * fail the donation.
 */
export async function handle_paypal_order_capture({
  order_id,
  don_id,
}: IPaypalOrderCapturePayload) {
  const order = await paypal.get_order(order_id).catch((e: unknown) => {
    // expired or voided since: there is nothing left to capture
    if (e instanceof PayPalApiError && e.http_status === 404) return null;
    throw e;
  });
  if (order?.status !== "APPROVED") return;

  try {
    await paypal.capture_order(order_id, `capture-${order_id}`);
  } catch (e) {
    if (!(e instanceof PayPalApiError) || e.http_status !== 422) throw e;
    const issues = issues_of(e);
    if (issues.includes("ORDER_ALREADY_CAPTURED")) return;
    const refused = issues.find((i) => FUNDING_REFUSED.has(i));
    if (!refused) throw e;
    // the donor left before capture, so this report is the only trace of it
    report_degraded(e, { order_id, don_id, issue: refused });
  }
}
