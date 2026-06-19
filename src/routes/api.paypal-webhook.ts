import crypto from "node:crypto";
import { crc32 } from "node:zlib";
import type {
  Capture,
  Order,
  Sale,
  Subs,
  WebhookEvent,
} from "@better-giving/paypal";
import type { IDonation, IDonationSettled, IDonationUpdate } from "@/donations";
import { PLACEHOLDER_EMAIL } from "@/donations/schema";
import { report_error, report_resp } from "@/errors/report";
import { to_full } from "@/helpers/name";
import * as don_sttl_dist from "@/queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "@/queue/msgs/don-sttl-receipt";
import type { ISub, TInterval } from "@/subscriptions";
import { paypal as paypal_env } from "$/env";
import { paypal } from "$/kit/paypal";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import {
  donation_get,
  donation_put,
  donation_update,
  settlement_exists,
} from "$/pg/queries/donation";
import { sub_put } from "$/pg/queries/subscription";
import type { Route } from "./+types/api.paypal-webhook";

type TIntervalFrom = "DAY" | "WEEK" | "MONTH" | "YEAR";
const to_interval = (from: TIntervalFrom): TInterval => {
  switch (from) {
    case "DAY":
      return "day";
    case "WEEK":
      return "week";
    case "MONTH":
      return "month";
    case "YEAR":
      return "year";
  }
};

// builds an ISub from a paypal subscription resource + donation context.
// returns a string error message on missing data, else the record.
async function build_sub_record(args: {
  subs_id: string;
  sub: Subs;
  don: IDonation;
  from_email: string;
  create_time?: string;
  update_time?: string;
}): Promise<ISub | string> {
  const { subs_id, sub, don, from_email } = args;
  const create_time =
    args.create_time ?? sub.create_time ?? new Date().toISOString();
  const update_time =
    args.update_time ?? sub.update_time ?? new Date().toISOString();

  if (!sub.plan_id) return "missing subscription plan id";
  const plan = await paypal.get_plan(sub.plan_id);
  if (!plan) return "plan not found";
  const cycle = plan.billing_cycles?.[0];
  if (!cycle) return "missing plan billing cycle";
  const interval = cycle.frequency?.interval_unit;
  const interval_count = cycle.frequency?.interval_count || 1;
  if (!interval) return "missing plan frequency interval unit";
  const next_billing = sub.billing_info?.next_billing_time;
  if (!next_billing) return "missing next billing time";
  if (!plan.product_id) return "missing plan product id";

  const total = don.amount.base + don.amount.tip + don.amount.fee_allowance;
  const total_usd = total / don.upusd;
  return {
    id: subs_id,
    created_at: new Date(create_time).toISOString(),
    updated_at: new Date(update_time).toISOString(),
    interval: to_interval(interval),
    interval_count,
    next_billing: new Date(next_billing).toISOString(),
    amount: total,
    amount_usd: total_usd,
    currency: don.currency,
    product_id: plan.product_id,
    to_npo_id: don.to_type === "npo" ? Number(don.to_id) : null,
    to_fund_id: don.to_type === "fund" ? don.to_id : null,
    to_name: don.to_name,
    platform: "paypal",
    status: "active",
    from_id: from_email,
  };
}

interface IAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_1?: string;
  admin_area_2?: string;
  postal_code?: string;
  country_code: string;
}
interface IName {
  given_name?: string;
  surname?: string;
}

interface ISettlement {
  net: number;
  fee: number;
  c: string;
}

const donor_update = (
  email: string,
  name: IName | undefined,
  address?: IAddress | undefined
): IDonationUpdate => {
  const {
    address_line_1: l1,
    address_line_2: l2,
    admin_area_1: state,
    admin_area_2: city,
    postal_code: zip,
    country_code: country,
  } = address || {};

  const update: IDonationUpdate = {};

  const fn = [name?.given_name, name?.surname].filter(Boolean).join(" ") || "";
  const str = [l1, l2].filter(Boolean).join(" ") || "";
  if (email) update.from_email = email;
  if (fn) update.from_name = to_full(name?.given_name, name?.surname);
  if (str) update.from_addr_street = str;
  if (city) update.from_addr_city = city;
  if (state) update.from_addr_state = state;
  if (zip) update.from_addr_zip_code = zip;
  if (country) update.from_addr_country = country;
  return update;
};

// -- signature verification --

const cert_cache = new Map<string, string>();
async function download_and_cache_cert(cert_url: string): Promise<string> {
  if (cert_cache.has(cert_url)) return cert_cache.get(cert_url)!;
  const res = await fetch(cert_url);
  if (!res.ok) throw res;
  const cert = await res.text();
  cert_cache.set(cert_url, cert);
  return cert;
}

type VerifyResult =
  | { error: true; status: number; message: string; body?: undefined }
  | { error: false; body: string; status?: undefined; message?: undefined };

async function verified_body(
  body: string,
  headers: Headers
): Promise<VerifyResult> {
  try {
    const transmission_id = headers.get("paypal-transmission-id");
    const timestamp = headers.get("paypal-transmission-time");
    const cert_url = headers.get("paypal-cert-url");
    const signature = headers.get("paypal-transmission-sig");

    if (!transmission_id)
      return {
        error: true,
        status: 201,
        message: "missing paypal-transmission-id",
      };
    if (!timestamp)
      return {
        error: true,
        status: 201,
        message: "missing paypal-transmission-time",
      };
    if (!cert_url)
      return { error: true, status: 201, message: "missing paypal-cert-url" };
    if (!signature)
      return {
        error: true,
        status: 201,
        message: "missing paypal-transmission-sig",
      };

    const crc_body = crc32(body);
    const message = [
      transmission_id,
      timestamp,
      paypal_env.webhook_id,
      crc_body,
    ].join("|");

    const cert = await download_and_cache_cert(cert_url);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(message);

    const signature_buffer = Buffer.from(signature, "base64");
    const is_valid = verifier.verify(cert, signature_buffer);
    if (!is_valid)
      return { error: true, status: 201, message: "invalid signature" };

    return { error: false, body };
  } catch (error) {
    report_error(error);
    return {
      error: true,
      status: 201,
      message: "signature verification error",
    };
  }
}

// -- route action --

export async function action({ request }: Route.ActionArgs) {
  try {
    const body = await request.text();
    const result = await verified_body(body, request.headers);
    if (result.error)
      return new Response(result.message, { status: result.status });

    const ev: WebhookEvent = JSON.parse(result.body);

    console.info("[paypal webhook] received:", JSON.stringify(ev, null, 2));

    switch (ev.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const {
          id: subs_id,
          subscriber,
          custom_id: don_id,
          create_time = new Date().toISOString(),
          update_time = new Date().toISOString(),
        } = ev.resource as Subs;

        if (!don_id) return new Response("missing don id", { status: 400 });
        const don = await donation_get(don_id);
        if (!don) return new Response("don record not found", { status: 500 });

        //create subs record
        if (!subscriber?.email_address)
          return new Response("missing subscriber email", { status: 400 });

        const donor = donor_update(
          subscriber.email_address,
          subscriber.name,
          subscriber.shipping_address?.address
        );

        // update onholddb with donor info
        const updated_don = await donation_update(db, don_id, donor);
        console.info("don donor info updated:", updated_don);

        if (!subs_id)
          return new Response("missing subscription id", { status: 400 });

        const subs_db = await build_sub_record({
          subs_id,
          sub: ev.resource as Subs,
          don,
          from_email: updated_don.from_email,
          create_time,
          update_time,
        });
        if (typeof subs_db === "string")
          return new Response(subs_db, { status: 400 });

        await sub_put(db, subs_db);
        return new Response(`created subscription record ${subs_id}`, {
          status: 200,
        });
      }
      case "CHECKOUT.ORDER.APPROVED": {
        const {
          id: order_id,
          payment_source,
          purchase_units,
        } = ev.resource as Order;

        if (!order_id) return new Response("missing order id", { status: 400 });

        const ps = payment_source?.venmo || payment_source?.paypal;

        /** we only expect paypal and venmo */
        if (!ps)
          return new Response("paypal and venmo not found", { status: 400 });
        if (!ps.email_address)
          return new Response("missing payer email address", { status: 400 });
        const donor = donor_update(ps.email_address, ps.name, ps.address);

        const don_id = purchase_units?.[0]?.custom_id;
        if (!don_id) {
          return new Response(`missing onhold id for order: ${order_id}`, {
            status: 400,
          });
        }
        await donation_update(db, don_id, donor);

        return new Response("updated onhold donor info", { status: 200 });
      }
      case "PAYMENT.CAPTURE.COMPLETED": {
        const {
          id: cid,
          create_time: create_date = new Date().toISOString(),
          custom_id: don_id,
          seller_receivable_breakdown: b,
          supplementary_data,
        } = ev.resource as Capture;
        if (!cid) return new Response("missing capture id", { status: 400 });

        // idempotency: already processed this capture
        if (await settlement_exists(cid)) {
          console.info(
            `[paypal webhook] capture ${cid} already settled, skipping`
          );
          return new Response("already processed", { status: 200 });
        }

        if (!b?.net_amount || !b.paypal_fee) {
          return new Response(`missing breakdown for capture ${cid}`, {
            status: 400,
          });
        }

        const settled = ((r): ISettlement => {
          const n = b.net_amount.value;
          const p = b.paypal_fee.value;
          const c = b.net_amount.currency_code;
          if (r) {
            return { net: +n * +r, fee: +p * +r, c };
          }
          return { net: +n, fee: +p, c };
        })(b.exchange_rate?.value);

        if (!don_id)
          return new Response(`missing onhold id for capture: ${cid}`, {
            status: 400,
          });

        // fetch order to get real payer email before settling
        const order_id = supplementary_data?.related_ids?.order_id;
        if (order_id) {
          const order = await paypal.get_order(order_id);
          const ps =
            order.payment_source?.venmo || order.payment_source?.paypal;
          if (ps?.email_address) {
            const donor = donor_update(ps.email_address, ps.name, ps.address);
            await donation_update(db, don_id, donor);
          }
        }

        // if still placeholder email, retry unless donation is old (>1h)
        const don = await donation_get(don_id);
        if (don && don.from_email === PLACEHOLDER_EMAIL) {
          const age_ms = Date.now() - new Date(don.created_at).getTime();
          if (age_ms < 60 * 60 * 1000) {
            console.warn(
              `[paypal webhook] placeholder email on ${don_id}, requesting retry`
            );
            return new Response("placeholder email, retry later", {
              status: 503,
            });
          }
          report_error(
            new Error(
              `[paypal webhook] settling ${don_id} with placeholder email (timeout)`
            ),
            { don_id }
          );
        }

        const sttl_record = {
          id: cid,
          date: create_date,
          currency: "USD",
          fee: settled.fee,
          net: settled.net,
        } as const;

        const payload = await db.transaction(async (tx) => {
          return donation_update(tx, don_id, {
            status: "settled",
            settlement: sttl_record,
          });
        });
        await enqueue(
          don_sttl_dist.to_msg(payload as IDonationSettled),
          don_sttl_receipt.to_msg(payload)
        );

        console.info(`donation settled: ${payload.id}`);
        return Response.json({ id: payload.id });
      }
      case "PAYMENT.SALE.COMPLETED": {
        const {
          id: sale_id,
          create_time: create_date = new Date().toISOString(),
          billing_agreement_id: subs_id,
          transaction_fee,
          receivable_amount,
          amount: sale_amount,
          exchange_rate: rate, // unit per usd
        } = ev.resource as Sale;
        if (!sale_id) return new Response("missing sale id", { status: 400 });

        // idempotency: already processed this sale
        if (await settlement_exists(sale_id)) {
          console.info(
            `[paypal webhook] sale ${sale_id} already settled, skipping`
          );
          return new Response("already processed", { status: 200 });
        }

        const tf = transaction_fee?.value;
        // receivable_amount only present on currency conversions
        const net =
          receivable_amount?.value ??
          (sale_amount?.total && tf
            ? String(+sale_amount.total - +tf)
            : undefined);
        const cur = receivable_amount?.currency ?? sale_amount?.currency;

        if (!net || !tf || !cur)
          return new Response(`missing amounts for sale: ${sale_id}`, {
            status: 400,
          });

        const settled: ISettlement = {
          net: +net,
          fee: rate ? +tf * +rate : +tf,
          c: cur,
        };

        if (!subs_id)
          return new Response("missing billing agreement id", { status: 400 });
        const sub = await paypal.get_subscription(subs_id);
        if (!sub)
          return new Response("subscription not found", { status: 400 });
        if (!sub.subscriber)
          return new Response("missing subscriber info", { status: 400 });
        if (!sub.custom_id)
          return new Response("missing onhold id", { status: 400 });
        const don_id = sub.custom_id;
        const { email_address: email, shipping_address, name } = sub.subscriber;
        if (!email)
          return new Response("missing subscriber email", { status: 400 });

        const donor = donor_update(email, name, shipping_address?.address);

        const p = await db.transaction(async (tx) => {
          const don = await donation_update(tx, don_id, {
            ...donor,
          });
          // upsert subscription row before referencing its FK on the donation;
          // BILLING.SUBSCRIPTION.ACTIVATED may not have landed yet (paypal does
          // not guarantee webhook ordering).
          const subs_db = await build_sub_record({
            subs_id,
            sub,
            don,
            from_email: don.from_email,
          });
          if (typeof subs_db === "string")
            throw new Error(`paypal sale.completed: ${subs_db}`);
          await sub_put(tx, subs_db);
          const sttl_record = {
            id: sale_id,
            date: create_date,
            currency: cur,
            fee: settled.fee,
            net: settled.net,
          } as const;

          if (!don.settlement) {
            // first settlement
            return donation_update(tx, don_id, {
              status: "settled",
              settlement: sttl_record,
              subscription_id: subs_id,
            });
          }

          // recurring rebill — persist a new donation record
          const rebill: IDonation = {
            ...don,
            id: crypto.randomUUID(),
            id_v1: undefined,
            created_at: create_date,
            updated_at: create_date,
            settlement: sttl_record,
            subscription_id: subs_id,
          };
          return donation_put(tx, rebill);
        });
        await enqueue(
          don_sttl_dist.to_msg(p as IDonationSettled),
          don_sttl_receipt.to_msg(p)
        );

        return Response.json({ id: p.id });
      }
    }
    console.info(JSON.stringify(ev, null, 2));
    return new Response(`event type not handled: ${ev.event_type}`, {
      status: 201,
    });
  } catch (error) {
    return report_resp(error, "error processing webhook");
  }
}
