import crypto from "node:crypto";
import { report_resp } from "#/errors/report";
import {
  type ChariotMetadata,
  calc_donation_settle,
  type ISettlement,
} from "@/donations";
import { chariot as chariot_env } from "$/env";
import { chariot } from "$/kit/chariot";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";
import type { Route } from "./+types/api.chariot-webhook";

/** `t=<iso-8601>,v1=<hex>[,v1=<hex>…]` — collects every `v1`, any of which may match; non-`v1` schemes are ignored (downgrade) */
function parse_signature(header: string): { t: string; v1: string[] } | null {
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;
    if (key === "t") t = value;
    else if (key === "v1") v1.push(value);
  }
  return t && v1.length ? { t, v1 } : null;
}

function safe_equals(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  // timingSafeEqual throws on unequal lengths
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const sig = request.headers.get("chariot-webhook-signature");
    const body = await request.text();

    const parsed = parse_signature(sig ?? "");
    if (!parsed)
      return new Response("malformed signature header", { status: 400 });

    const signed = `${parsed.t}.${body}`;
    const hash = crypto
      .createHmac("sha256", chariot_env.signing_key)
      .update(signed)
      .digest("hex");

    // 4xx, not 2xx: chariot reads 2xx as delivered, so a signing-key mismatch
    // would drop every grant silently; a 4xx is redelivered in production and,
    // failing 5 days, flags the subscription `requires_attention`.
    // warn, not report_error — forgeries are free.
    if (!parsed.v1.some((v) => safe_equals(hash, v))) {
      console.warn(
        `[chariot webhook] signature mismatch: t=${parsed.t}, ${parsed.v1.length} v1`
      );
      return new Response("signature mismatch", { status: 401 });
    }

    const payload = JSON.parse(body);
    // https://docs.givechariot.com/api/webhooks
    const category = payload.category ?? "unknown";
    if (payload.associated_object_type !== "grant") {
      console.info(
        `[chariot webhook] ignored: event ${payload.id} ${category} ${payload.associated_object_type}`
      );
      return new Response("", { status: 200 });
    }
    console.info(`[chariot webhook] received: event ${payload.id} ${category}`);
    const grant = await chariot.get_grant(payload.associated_object_id);
    // grant carries donor name, email, phone, address — log ids/status only
    console.info(`[chariot webhook] grant ${grant.id} status ${grant.status}`);
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
    // the refund already reversed this donation; a 2xx so chariot stops
    // redelivering rather than a throw that reads as a broken endpoint.
    if (result.op === "noop") return Response.json({ id: don_id });
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
