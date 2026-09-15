import crypto from "node:crypto";
import { report_resp } from "#/errors/report";
import type { IDonation } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { nowpayments } from "$/env";
import { donation_get, settle_state_of } from "$/pg/queries/donation";
import type { Route } from "./+types/route";
import { alert } from "./handlers/alert";
import { handle_confirming } from "./handlers/confirming";
import { handle_failed } from "./handlers/failed";
import { ref_of } from "./handlers/payment";
import { handle_repeat } from "./handlers/repeat";
import { handle_settled } from "./handlers/settled";
import { transition } from "./handlers/status";
import { write_on } from "./handlers/write";

// mirrors the official sdk's `sortObjectDeep`: default code-unit `.sort()`, into
// objects and arrays. the docs' prose `JSON.stringify(p, Object.keys(p).sort())`
// is wrong — a replacer array drops every nested key not also top-level.
const sort_deep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sort_deep);
  if (value && typeof value === "object" && value.constructor === Object) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sort_deep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
};

const is_signed = (payload: unknown, sig: string, secret: string): boolean => {
  const expected = Buffer.from(
    crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(sort_deep(payload)))
      .digest("hex"),
    "hex"
  );
  const actual = Buffer.from(sig.trim(), "hex");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
};

export async function action({ request }: Route.ActionArgs) {
  const sig = request.headers.get("x-nowpayments-sig");
  if (!sig) return new Response("invalid request", { status: 400 });

  const body = await request.text();

  // a body that isn't json is permanent — redelivery cannot make it parse — so
  // it answers 400 like the two branches around it rather than a 5xx.
  // nowpayments documents only that the callback "must return a 200 OK"; a 500
  // is assumed failed and redelivered, and nothing in their docs deactivates an
  // ipn over repeated 4xx — which is the one way answering 400 here would cost
  // us the webhook.
  //
  // unreported for the same reason the signature mismatch below is: the
  // signature is computed over the *parsed* payload, so this runs before
  // anything has proved the caller holds the ipn secret, and an anonymous
  // request must not be able to page the team. logged, so a genuine change in
  // what nowpayments sends is still visible as a rate.
  let payment: NP.PaymentPayload;
  try {
    payment = JSON.parse(body || "{}");
  } catch {
    console.warn("nowpayments-webhook: unparseable body");
    return new Response("invalid request", { status: 400 });
  }

  try {
    if (!is_signed(payment, sig, nowpayments.ipn_secret)) {
      return new Response("invalid request", { status: 400 });
    }
    await dispatch(payment);
    // the body never echoes a donation — the record carries donor details
    return new Response("ok");
  } catch (err) {
    return report_resp(err, "Unknown error occurred");
  }
}

const carries_amount = new Set<NP.Payment.Status>([
  "confirming",
  "finished",
  "partially_paid",
]);

const log = (msg: string, ref: string) =>
  console.info(`nowpayments-webhook: ${msg} ${ref}`);

const ORDER = { repeat: false };

async function dispatch(payment: NP.PaymentPayload): Promise<void> {
  const status = payment.payment_status;
  const ref = ref_of(payment);

  // dashboard-created payments carry `order_id: null` — nothing of ours to settle
  if (!payment.order_id) return log("no order_id", ref);

  const prior = await donation_get(payment.order_id);
  if (!prior) return log("donation not found", ref);

  // a wrong-asset deposit reports `actually_paid` in the asset that arrived,
  // which recorded against the order's currency misstates the gift
  if (
    carries_amount.has(status) &&
    payment.pay_currency.toUpperCase() !== prior.currency
  ) {
    log("wrong asset held", ref);
    await alert({
      title: "Deposit in another asset held",
      type: "ERROR",
      body: `${ref} paid:${payment.pay_currency.toUpperCase()} order:${prior.currency}`,
    });
    return;
  }

  if (payment.parent_payment_id != null) {
    return handle_repeat(payment, prior);
  }

  const action = transition(settle_state_of(prior), payment, ORDER);
  switch (action.op) {
    case "ignore":
      return log(action.why, ref);

    case "record": {
      const now = await write_on(prior.id, payment, ORDER, "record", {
        via_extra: payment.payment_id.toString(),
      });
      return log(now.op === "record" ? "waiting" : `waiting, ${now.op}`, ref);
    }

    case "confirm": {
      const now = await handle_confirming(payment, prior);
      return log(
        now.op === "confirm" ? "confirming" : `confirming, ${now.op}`,
        ref
      );
    }

    case "expire": {
      const now = await write_on(prior.id, payment, ORDER, "expire", {
        status: "expired",
      });
      return log(now.op === "expire" ? "expired" : `expired, ${now.op}`, ref);
    }

    case "fail": {
      const now = await handle_failed(payment, prior);
      return log(now.op === "fail" ? "failed" : `failed, ${now.op}`, ref);
    }

    case "refund": {
      const now = await write_on(prior.id, payment, ORDER, "refund", {
        status: "refunded",
      });
      if (now.op !== "refund") return log(`refunded, ${now.op}`, ref);
      log(`refunded prior:${prior.status}`, ref);
      // a settled donation already queued its distribution and receipt
      if (now.was_settled) {
        await alert({ title: "Settled donation refunded", body: ref });
      }
      return;
    }

    case "settle":
    case "duplicate":
    case "refuse":
      return settle(payment, prior, ref);

    default:
      action satisfies never;
  }
}

async function settle(
  payment: NP.PaymentPayload,
  prior: IDonation,
  ref: string
): Promise<void> {
  const res = await handle_settled(payment, prior);
  switch (res.op) {
    case "duplicate":
      return log("already settled", ref);
    case "ignored":
      return log(res.why, ref);
    case "refused":
      log(`settle refused prior:${prior.status}`, ref);
      // funds arrived for a donation we no longer consider open
      await alert({
        title: "Payment settled on a closed donation",
        type: "ERROR",
        body: `${ref} prior:${prior.status}`,
      });
      return;
    case "settled": {
      log("settled", ref);
      const partial = payment.payment_status === "partially_paid";
      const title = partial
        ? "Donation settled (partially paid)"
        : "Donation settled";
      const body = partial
        ? `${ref} paid:${payment.actually_paid} of ${payment.pay_amount} ${payment.pay_currency.toUpperCase()}`
        : ref;
      await alert({
        title: res.late ? `${title} late, over ${prior.status}` : title,
        body,
        fields: [
          {
            name: "outcome",
            value: `${payment.outcome_amount} ${payment.outcome_currency.toUpperCase()}`,
          },
        ],
      });
      return;
    }
    default:
      res satisfies never;
  }
}
