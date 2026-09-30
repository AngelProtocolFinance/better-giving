import { PayPalApiError } from "@better-giving/paypal";
import { report_degraded } from "#/errors/report";
import {
  type IPaypalOrderCapturePayload,
  PAYPAL_CAPTURE_DELAY_S,
} from "@/queue";
import { fiat_monitor } from "$/kit/discord";
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

/** qstash's first retry follows the first attempt within seconds, so it can
 * pass for the first; every retry after it is more than a minute past due */
const is_retry = (scheduled_at: string | undefined) =>
  !scheduled_at ||
  Date.now() - Date.parse(scheduled_at) > (PAYPAL_CAPTURE_DELAY_S + 60) * 1000;

/**
 * the fallback capture for an approval whose browser never captured — a closed
 * tab, a dropped network. only an order paypal still shows APPROVED is
 * captured, under the browser's own request id, so a capture the browser made
 * is returned rather than repeated. the capture's own webhook events settle or
 * fail the donation.
 *
 * a throw asks qstash for a retry. the donor has left, so once retrying, each
 * failure alerts ops: the route hands no retry count down to say which is the
 * last, and after it the message sits in the DLQ with the order uncaptured.
 */
export async function handle_paypal_order_capture(
  p: IPaypalOrderCapturePayload
) {
  try {
    await capture_if_approved(p);
  } catch (e) {
    if (is_retry(p.scheduled_at)) await alert_ops(p, e);
    throw e;
  }
}

/** never throws: the capture's own error is what asks qstash for the retry */
async function alert_ops(p: IPaypalOrderCapturePayload, e: unknown) {
  try {
    await fiat_monitor.send_alert({
      type: "ERROR",
      from: "q-handler/paypal-order-capture",
      title: "PayPal fallback capture failing",
      body: [
        `order ${p.order_id}, donation ${p.don_id}: ${e instanceof Error ? e.message : String(e)}`,
        "the donor approved and left. qstash retries for about a day, then drops the capture to the DLQ with the order uncaptured.",
      ].join("\n"),
    });
  } catch (alert_err) {
    report_degraded(alert_err, { order_id: p.order_id, don_id: p.don_id });
  }
}

async function capture_if_approved({
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
