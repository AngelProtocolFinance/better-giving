import crypto from "node:crypto";
import { report_resp } from "@/errors/report";
import type { NP } from "@/nowpayments/types";
import { nowpayments, stage } from "$/env";
import { aws_monitor } from "$/kit/discord";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";
import type { Route } from "./+types/route";
import { handle_confirming } from "./handlers/confirming";
import { handle_failed } from "./handlers/failed";
import { handle_settled } from "./handlers/settled";

export async function action({ request }: Route.ActionArgs) {
  const sig = request.headers.get("x-nowpayments-sig");
  if (!sig) return new Response("invalid request", { status: 400 });

  /// hash payload ///
  const body = await request.text();
  const payment: NP.PaymentPayload = JSON.parse(body || "{}");

  const payment_sorted: any = {};
  for (const [k, v] of Object.entries(payment).toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    payment_sorted[k] = v;
  }

  const hmac = crypto.createHmac("sha512", nowpayments.ipn_secret);
  hmac.update(JSON.stringify(payment_sorted));
  const payload_sig = hmac.digest("hex");

  if (payload_sig !== sig) {
    return new Response("invalid request", { status: 400 });
  }

  const status = payment.payment_status;

  try {
    if (
      // can be considered `pending`
      status === "sending" ||
      //if a donation failed (e.g. less than min amount) we would proceed with the actual amount (if still processable - not too small)
      status === "refunded" ||
      // `confirming` event switches the intent to `pending`
      status === "confirmed"
    ) {
      console.info(status, payment);
      return new Response("unhandled");
    }

    if (status === "waiting") {
      const res = await donation_update(db, payment.order_id, {
        via_extra: payment.payment_id.toString(),
      });
      console.info("waiting", res);
      return Response.json(res);
    }

    if (status === "confirming") {
      const res = await handle_confirming(payment, stage);
      console.info("confirming", res);
      return Response.json(res);
    }

    if (status === "expired") {
      const updated = await donation_update(db, payment.order_id, {
        status: "expired",
      });
      console.info("expired", updated);
      return Response.json(updated);
    }

    if (status === "failed") {
      const updated = await handle_failed(payment);
      console.info(`deleted failed payment:${payment.payment_id}`);
      return Response.json(updated);
    }

    const msg_ids = await handle_settled(payment);

    await aws_monitor.send_alert({
      from: `nowpayments-webhook-${stage}`,
      title: "Donation settled",
      body: JSON.stringify(payment),
      fields: [{ name: "message ids", value: JSON.stringify(msg_ids) }],
    });

    return new Response("Donation settled");
  } catch (err) {
    return report_resp(err, "Unknown error occurred");
  }
}
