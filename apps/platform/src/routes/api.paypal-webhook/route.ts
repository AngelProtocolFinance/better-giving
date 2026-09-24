import crypto from "node:crypto";
import { crc32 } from "node:zlib";
import type {
  Capture,
  Order,
  Sale,
  Subs,
  WebhookEvent,
} from "@better-giving/paypal";
import { report_error, report_resp } from "#/errors/report";
import {
  calc_donation_settle,
  type IDonation,
  type IDonationSettled,
  type IDonationUpdate,
  is_reversed,
  settle_msgs,
} from "@/donations";
import { paypal_donor_update } from "@/donations/helpers";
import { PLACEHOLDER_EMAIL } from "@/donations/schema";
import type { ISub, TInterval } from "@/subscriptions";
import { paypal as paypal_env } from "$/env";
import { paypal } from "$/kit/paypal";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import {
  donation_by_sttl_id,
  donation_get,
  donation_put,
  donation_settle_state_locked,
  donation_update,
  settlement_exists,
} from "$/pg/queries/donation";
import { sub_put } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";

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
// returns a string naming what the subscription or its plan lacks, else the
// record. ACTIVATED passes its event payload, which a redelivery repeats, so it
// acknowledges the gap; SALE passes the live subscription, which can still be
// APPROVED with no billing_info when the first sale lands, so it asks for a
// redelivery.
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
  // get_plan throws on a non-2xx; a 2xx with no body is the fetch's fault, not
  // the payload's, so it throws to a redelivery rather than returning a gap
  if (!plan) throw new Error(`plan not found: ${sub.plan_id}`);
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

// paypal amounts are decimal strings; as floats 50 − 2.24 − 0.7 is
// 47.059999999999995, so this subtracts in the finest minor unit the operands use
const dec_sub = (from: string, parts: string[]): number => {
  const dp = Math.max(
    ...[from, ...parts].map((v) => v.split(".")[1]?.length ?? 0)
  );
  const k = 10 ** dp;
  const minor = (v: string) => Math.round(+v * k);
  return parts.reduce((acc, v) => acc - minor(v), minor(from)) / k;
};

// paypal hands the three parts separately at every call site — an order's
// payment source, a subscriber, a shipping address — so they are gathered here
// rather than at each of the four
const donor_update = (
  email: string,
  name: IName | undefined,
  address?: IAddress | undefined
): IDonationUpdate =>
  paypal_donor_update({ email_address: email, name, address });

/**
 * the enqueue sits after the commit, so a delivery can leave a settled row
 * whose messages never went out, or only some of them; the delivery whose
 * settle guard fires re-sends them all. a duplicate costs nothing — the dist is
 * absorbed by unique(donation_id, to_id), the match event by its unique
 * donation_id, the receipt by its send claim.
 *
 * a reversed row is the one case that must not be recomputed: the settle path
 * refuses to write over a refund, and re-queuing here would walk around that
 * with a dist and a receipt for money the donor already got back.
 */
const requeue = async (row: IDonation | undefined, order_id: string) => {
  if (!row?.settlement)
    throw new Error("duplicate settle without a settlement");
  if (is_reversed(row.status)) return;
  await enqueue(
    ...settle_msgs(
      { ...row, settlement: row.settlement },
      // the settlement living on the order row means this was the charge that
      // opened the donation; on any other row it is a rebill clone, which is
      // excluded from employer matching.
      { match: row.id === order_id }
    )
  );
};

/**
 * `requeue` for a sale settled on an earlier delivery. the match flag needs the
 * order id, and only the subscription's custom_id carries it — nothing on the
 * settled row tells the order row from a rebill clone.
 *
 * a failed fetch throws through to a non-2xx: this redelivery is usually the
 * one recovering messages an earlier delivery never sent, and a 200 here would
 * stop paypal retrying with the dist still unsent. a missing subs id or
 * custom_id is reported and answered 200 instead — no retry can supply either.
 */
const requeue_sale = async (sale_id: string, subs_id: string | undefined) => {
  const order_id = subs_id
    ? (await paypal.get_subscription(subs_id))?.custom_id
    : undefined;
  if (!order_id) {
    report_error(new Error(`no order id to requeue sale ${sale_id}`), {
      sale_id,
      subs_id,
    });
    return;
  }
  await requeue(await donation_by_sttl_id(sale_id), order_id);
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

    const cert = await download_and_cache_cert(cert_url).catch(
      (error: unknown) => {
        report_error(error);
        return null;
      }
    );
    // an unreachable cert host says nothing about the event; a non-2xx keeps
    // paypal redelivering it
    if (cert === null)
      return { error: true, status: 503, message: "cert download failed" };

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

/**
 * paypal redelivers any non-2xx up to 25 times over 3 days, always with the
 * same payload — so a delivery missing what the route needs is reported and
 * acknowledged. anything a later attempt could fix keeps its non-2xx.
 */
const unroutable = (ev: WebhookEvent, reason: string) => {
  report_error(new Error(`[paypal webhook] unroutable: ${reason}`), {
    event_id: ev.id,
    event_type: ev.event_type,
    resource_id: ev.resource?.id,
  });
  return new Response(`not routable: ${reason}`, { status: 200 });
};

export async function action({ request }: Route.ActionArgs) {
  try {
    const body = await request.text();
    const result = await verified_body(body, request.headers);
    if (result.error)
      return new Response(result.message, { status: result.status });

    const ev: WebhookEvent = JSON.parse(result.body);

    console.info(
      `[paypal webhook] received: ${ev.event_type} ${ev.id} resource ${ev.resource?.id}`
    );

    switch (ev.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const {
          id: subs_id,
          subscriber,
          custom_id: don_id,
          create_time = new Date().toISOString(),
          update_time = new Date().toISOString(),
        } = ev.resource as Subs;

        if (!don_id) return unroutable(ev, "missing don id");
        const don = await donation_get(don_id);
        if (!don) return new Response("don record not found", { status: 500 });

        //create subs record
        if (!subscriber?.email_address)
          return unroutable(ev, "missing subscriber email");

        const donor = donor_update(
          subscriber.email_address,
          subscriber.name,
          subscriber.shipping_address?.address
        );

        // update the donation with donor info
        const updated_don = await donation_update(db, don_id, donor);
        console.info(`don donor info updated: ${updated_don.id}`);

        if (!subs_id) return unroutable(ev, "missing subscription id");

        const subs_db = await build_sub_record({
          subs_id,
          sub: ev.resource as Subs,
          don,
          from_email: updated_don.from_email,
          create_time,
          update_time,
        });
        if (typeof subs_db === "string") return unroutable(ev, subs_db);

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

        if (!order_id) return unroutable(ev, "missing order id");

        const ps = payment_source?.venmo || payment_source?.paypal;

        /** we only expect paypal and venmo */
        if (!ps) return unroutable(ev, "paypal and venmo not found");
        if (!ps.email_address)
          return unroutable(ev, "missing payer email address");
        const donor = donor_update(ps.email_address, ps.name, ps.address);

        const don_id = purchase_units?.[0]?.custom_id;
        if (!don_id)
          return unroutable(ev, `missing onhold id for order: ${order_id}`);
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
        if (!cid) return unroutable(ev, "missing capture id");
        if (!don_id)
          return unroutable(ev, `missing onhold id for capture: ${cid}`);

        // idempotency: already processed this capture. rechecked under the
        // order row's lock below — this one only spares a redelivery the order
        // fetch and the settle math.
        if (await settlement_exists(cid)) {
          console.info(
            `[paypal webhook] capture ${cid} already settled, skipping`
          );
          await requeue(await donation_by_sttl_id(cid), don_id);
          return new Response("already processed", { status: 200 });
        }

        if (!b?.gross_amount)
          return unroutable(ev, `missing gross amount for capture ${cid}`);

        const platform_fees = b.platform_fees ?? [];
        // a fallback net subtracts these from gross, which only works in one currency
        if (
          !b.net_amount &&
          platform_fees.some(
            (f) => f.amount.currency_code !== b.gross_amount.currency_code
          )
        )
          return unroutable(
            ev,
            `platform fee currency differs from gross for capture ${cid}`
          );

        // only gross_amount is required in the breakdown; fee and net may be absent
        const settled = ((r): ISettlement => {
          const p = b.paypal_fee?.value ?? "0";
          const n =
            b.net_amount?.value ??
            dec_sub(b.gross_amount.value, [
              p,
              ...platform_fees.map((f) => f.amount.value),
            ]);
          const c = b.net_amount?.currency_code ?? b.gross_amount.currency_code;
          if (r) {
            return { net: +n * +r, fee: +p * +r, c };
          }
          return { net: +n, fee: +p, c };
        })(b.exchange_rate?.value);

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
        };

        const prior = await donation_get(don_id);
        if (!prior)
          return new Response(`donation not found: ${don_id}`, { status: 500 });
        const result = calc_donation_settle({
          kind: "one-time",
          order_id: don_id,
          prior,
          settlement: sttl_record,
        });
        // the refund already reversed this donation; a 2xx so paypal stops
        // redelivering rather than a throw that reads as a broken endpoint.
        if (result.op === "noop")
          return Response.json({ id: don_id }, { status: 200 });
        if (result.op !== "update")
          throw new Error("unexpected put for paypal capture");

        const p = await db.transaction(
          async (
            tx
          ): Promise<
            | { op: "dup"; row: IDonation | undefined }
            | { op: "reversed" }
            | { op: "settled"; row: IDonation }
          > => {
            // the guard above read outside this transaction, so two concurrent
            // deliveries of one capture can both pass it. re-decide under the
            // order row's write lock, where the loser reads what the winner
            // committed.
            const state = await donation_settle_state_locked(
              tx,
              result.order_id
            );
            if (!state) throw new Error(`donation not found: ${don_id}`);
            if (await settlement_exists(cid, tx))
              return { op: "dup", row: await donation_by_sttl_id(cid, tx) };
            // `result.patch` was computed from a read taken before the lock; a
            // refund committed since then must not be written back to settled.
            if (is_reversed(state.status)) return { op: "reversed" };
            return {
              op: "settled",
              row: await donation_update(tx, result.order_id, result.patch),
            };
          }
        );

        if (p.op === "reversed")
          return Response.json({ id: don_id }, { status: 200 });
        if (p.op === "dup") {
          await requeue(p.row, don_id);
          return new Response("already processed", { status: 200 });
        }
        await enqueue(...result.msgs);

        console.info(`donation settled: ${p.row.id}`);
        return Response.json({ id: p.row.id });
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
        if (!sale_id) return unroutable(ev, "missing sale id");

        // idempotency: already processed this sale. rechecked under the order
        // row's lock below — this one only spares a redelivery the plan fetch
        // and the settle math.
        if (await settlement_exists(sale_id)) {
          console.info(
            `[paypal webhook] sale ${sale_id} already settled, skipping`
          );
          await requeue_sale(sale_id, subs_id);
          return new Response("already processed", { status: 200 });
        }

        if (!sale_amount?.total)
          return unroutable(ev, `missing total for sale: ${sale_id}`);

        const tf = transaction_fee?.value ?? 0;
        // receivable_amount only present on currency conversions
        const net = receivable_amount?.value ?? +sale_amount.total - +tf;
        const cur = receivable_amount?.currency ?? sale_amount.currency;

        const settled: ISettlement = {
          net: +net,
          fee: rate ? +tf * +rate : +tf,
          c: cur,
        };

        if (!subs_id) return unroutable(ev, "missing billing agreement id");
        const sub = await paypal.get_subscription(subs_id);
        if (!sub)
          return new Response("subscription not found", { status: 400 });
        // no redelivery supplies either on its own. custom_id is patchable
        // (subscriptions PATCH, add/replace); after patching it, resend this
        // event by the event_id in the report. of the subscriber, only
        // shipping_address is patchable, so a missing subscriber or email has
        // no recovery.
        if (!sub.subscriber) return unroutable(ev, "missing subscriber info");
        if (!sub.custom_id) return unroutable(ev, "missing onhold id");
        const don_id = sub.custom_id;
        const { email_address: email, shipping_address, name } = sub.subscriber;
        if (!email) return unroutable(ev, "missing subscriber email");

        const donor = donor_update(email, name, shipping_address?.address);

        const don = await donation_get(don_id);
        if (!don) return new Response("don record not found", { status: 500 });

        // build the subscription record before opening the tx: build_sub_record
        // makes an external paypal.get_plan call we don't want to hold a db
        // connection open for.
        const subs_db = await build_sub_record({
          subs_id,
          sub,
          don,
          // use the subscriber email directly: if SALE.COMPLETED races ahead of
          // BILLING.SUBSCRIPTION.ACTIVATED, don.from_email is still the
          // placeholder, and sub_put's onConflictDoNothing would freeze it in.
          from_email: email,
        });
        if (typeof subs_db === "string")
          return new Response(`subscription not ready: ${subs_db}`, {
            status: 400,
          });

        const sttl_record = {
          id: sale_id,
          date: create_date,
          currency: cur,
          fee: settled.fee,
          net: settled.net,
        };

        const p = await db.transaction(async (tx) => {
          // the guard above read outside this transaction, so two concurrent
          // deliveries of one sale can both pass it. re-decide under the order
          // row's write lock: without it the loser sees the settlement the
          // winner wrote, takes the rebill branch, and clones a donation that
          // loses on the sttl_id unique index.
          const state = await donation_settle_state_locked(tx, don_id);
          if (!state) throw new Error(`don record not found: ${don_id}`);
          if (await settlement_exists(sale_id, tx))
            return {
              dup: true as const,
              row: await donation_by_sttl_id(sale_id, tx),
              msgs: [],
            };

          const don = await donation_update(tx, don_id, { ...donor });
          // upsert subscription row before referencing its FK on the donation;
          // BILLING.SUBSCRIPTION.ACTIVATED may not have landed yet (paypal does
          // not guarantee webhook ordering).
          await sub_put(tx, subs_db);

          const result = don.settlement
            ? calc_donation_settle({
                kind: "rebill",
                order_id: don_id,
                prior: don as IDonationSettled,
                settlement: sttl_record,
                subs_id,
                new_id: crypto.randomUUID(),
              })
            : calc_donation_settle({
                kind: "first-recurring",
                order_id: don_id,
                prior: don,
                settlement: sttl_record,
                subs_id,
              });

          // noop reaches here only from the first-recurring branch — a rebill
          // clones the order row rather than settling it, so it never yields
          // one. the order row it would have settled is already reversed.
          if (result.op === "noop")
            return { dup: false as const, row: don, msgs: [] };
          return result.op === "update"
            ? {
                dup: false as const,
                row: await donation_update(tx, result.order_id, result.patch),
                msgs: result.msgs,
              }
            : {
                dup: false as const,
                row: await donation_put(tx, result.row),
                msgs: result.msgs,
              };
        });

        if (p.dup) {
          await requeue(p.row, don_id);
          return new Response("already processed", { status: 200 });
        }
        await enqueue(...p.msgs);

        return Response.json({ id: p.row.id });
      }
    }
    console.info(
      `[paypal webhook] not handled: ${ev.event_type} ${ev.id} resource ${ev.resource?.id}`
    );
    return new Response(`event type not handled: ${ev.event_type}`, {
      status: 201,
    });
  } catch (error) {
    return report_resp(error, "error processing webhook");
  }
}
