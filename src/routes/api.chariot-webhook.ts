import crypto from "node:crypto";
import type {
  ChariotMetadata,
  IDonationSettled,
  ISettlement,
} from "@/donations";
import { report_resp } from "@/errors/report";
import * as don_sttl_dist from "@/queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "@/queue/msgs/don-sttl-receipt";
import { chariot as chariot_env } from "$/env";
import { chariot } from "$/kit/chariot";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";
import type { Route } from "./+types/api.chariot-webhook";

export async function action({ request }: Route.ActionArgs) {
  try {
    const sig = request.headers.get("chariot-webhook-signature");
    const body = await request.text();

    if (!sig) return new Response("missig signature header", { status: 403 });

    // verify received payload
    const timestamp = sig.match(/[^t=]*Z/g)![0];
    const sig_hash = sig.split("v1=")[1];

    const signed = `${timestamp}.${body}`;
    const hash = crypto
      .createHmac("sha256", chariot_env.signing_key)
      .update(signed)
      .digest("hex");

    if (hash !== sig_hash) return new Response("", { status: 201 });

    const payload = JSON.parse(body);
    // https://docs.givechariot.com/api/webhooks
    const grant = await chariot.get_grant(payload.associated_object_id);
    console.info(payload, grant);
    const { don_id } = grant.metadata as unknown as ChariotMetadata;

    if (grant.status === "Canceled") {
      await donation_update(db, don_id, { status: "cancelled" });
      console.info(`chariot grant:${don_id} cancelled and deleted`);
      return new Response("", { status: 202 });
    }

    if (grant.status !== "Completed") {
      console.info(`${don_id} status:${grant.status}`);
      // avoid retry
      return new Response("", { status: 203 });
    }

    const gross = grant.amount / 100;
    const fee = (grant.feeDetail?.total ?? 0) / 100;

    const settlement: ISettlement = {
      date: new Date().toISOString(),
      net: gross - fee,
      fee,
      id: grant.id,
      currency: "USD",
    };

    const order = await db.transaction(async (tx) => {
      return donation_update(tx, don_id, {
        status: "settled",
        settlement,
      });
    });
    await enqueue(
      don_sttl_dist.to_msg(order as IDonationSettled),
      don_sttl_receipt.to_msg(order)
    );

    return Response.json({ id: order.id });
  } catch (err) {
    return report_resp(err, "something went wrong");
  }
}
