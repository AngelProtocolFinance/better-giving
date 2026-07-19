import crypto from "node:crypto";
import {
  type ChariotMetadata,
  calc_donation_settle,
  type ISettlement,
} from "@/donations";
import { report_resp } from "@/errors/report";
import { chariot as chariot_env } from "$/env";
import { chariot } from "$/kit/chariot";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";
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

    const prior = await donation_get(don_id);
    if (!prior)
      return new Response(`donation not found: ${don_id}`, { status: 500 });
    const result = calc_donation_settle({
      kind: "one-time",
      order_id: don_id,
      prior,
      settlement,
    });
    if (result.op !== "update")
      throw new Error("unexpected put for chariot one-time");

    const order = await db.transaction((tx) =>
      donation_update(tx, result.order_id, result.patch)
    );
    await enqueue(...result.msgs);

    return Response.json({ id: order.id });
  } catch (err) {
    return report_resp(err, "something went wrong");
  }
}
