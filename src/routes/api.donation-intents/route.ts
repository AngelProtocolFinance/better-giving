import { is_custom, tokens_map } from "@better-giving/crypto";
import type { ActionFunction } from "react-router";
import { getDotPath, safeParse } from "valibot";
import {
  donations_cookie,
  type IDonationIntentExpiries,
} from "#/.server/cookie";
import { to_fn } from "#/.server/donation-recipient";
import { unit_per_usd } from "#/.server/unit-per-usd";
import type { Payment } from "#/types/crypto";
import { MIN_DONATION_USD } from "@/constants/common";
import type { ChariotMetadata, IDonation } from "@/donations";
import { amnt_sum, to_from } from "@/donations/helpers";
import { type IStripeIntentReturn, intent as schema } from "@/donations/schema";
import { report_null } from "@/errors/report";
import { rd2num } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import { deposit_addr } from "$/deposit-addr";
import { base_url } from "$/env";
import { chariot } from "$/kit/chariot";
import { coingecko } from "$/kit/coingecko";
import { aws_monitor } from "$/kit/discord";
import { np } from "$/kit/nowpayments";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import { crypto_payment, type Order } from "./crypto-payment";
import { capture_order } from "./paypal/capture-order";
import { create_order } from "./paypal/create-order";
import { create_subs } from "./paypal/create-subs";
import { customer_with_currency } from "./stripe/customer-with-currency";
import { payment_intent } from "./stripe/payment-intent";
import { setup_intent } from "./stripe/setup-intent";

const json_with_cookie_fn =
  (existing: null | IDonationIntentExpiries) =>
  async (data: Record<string, any>, key: string) => {
    const now = Date.now();
    const obj = existing || {};

    // Remove expired keys
    for (const k of Object.keys(obj)) {
      if (obj[k] < now) {
        delete obj[k];
      }
    }

    obj[key] = now + 15 * 60 * 1000; // 15 minutes

    // keep only top 5 most recent keys
    const sorted_entries = Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const expiry_per_id = Object.fromEntries(sorted_entries);

    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "set-cookie": await donations_cookie.serialize(expiry_per_id),
      },
    });
  };

export const action: ActionFunction = async ({ request }) => {
  // server-side paypal capture
  if (request.method === "PATCH") {
    const { order_id, don_id } = await request.json();
    if (!order_id || !don_id)
      return resp.status(400, "missing order_id/don_id");
    const capture = await capture_order({ order_id, don_id });
    return Response.json(capture);
  }

  const expiry_per_intent: IDonationIntentExpiries | null =
    await donations_cookie.parse(request.headers.get("cookie"));

  const parsed = safeParse(schema, await request.json());
  if (parsed.issues) {
    const i = parsed.issues[0];
    return resp.status(400, `${getDotPath(i)}: ${i.message}`);
  }
  const { to_id, via, via_extra, donor, ...intent } = parsed.output;

  const to = await to_fn(to_id);
  const from = to_from(donor);

  if (!to) {
    return resp.txt(`Recipient:${to_id} not found`, 404);
  }

  const json_with_cookie = json_with_cookie_fn(expiry_per_intent);

  if (via === "crypto") {
    //custom bg token, return
    const token = tokens_map[intent.currency];

    const [min, usdpu] = await (async (t) => {
      if (is_custom(t.id)) {
        const res = await coingecko((x) => {
          x.pathname = `api/v3/simple/price?ids=${t.cg_id}&vs_currencies=usd`;
          return x;
        });
        if (!res.ok) throw res;
        const {
          [t.cg_id]: { usd },
        } = await res.json();
        return [1 / usd, usd];
      }

      const estimate = await np.estimate(intent.currency);
      return [estimate.min, estimate.usdpu];
    })(token);

    const to_pay = amnt_sum(intent.amount);

    if (to_pay < min) {
      return resp.txt(`Min amount for ${token.code} is: ${min}`, 400);
    }
    const r_id = crypto.randomUUID();
    const now = new Date().toISOString();
    const r: IDonation = {
      id: r_id,
      status: "intent",
      via: `${via}:${token.network}`,
      upusd: 1 / usdpu,
      created_at: now,
      updated_at: now,
      ...to,
      ...from,
      ...intent,
    };
    if (is_custom(token.id)) {
      r.via_extra = r_id;
    }

    const don = await donation_put(db, r);

    if (is_custom(token.id)) {
      const p: Payment = {
        id: r_id,
        order_id: r_id,
        address: deposit_addr(token.network),
        amount: to_pay,
        currency: token.code,
        description: to.to_name,
        usdpu,
      };

      if (token.id.startsWith("man_")) {
        const res = await aws_monitor
          .send_alert({
            from: "donation-intents-creator",
            type: "NOTICE",
            title: "Donation intent - manual notification",
            fields: [
              { name: "Intent ID", value: r_id },
              {
                name: "Amount",
                value: `${to_pay} ${token.code}`,
                inline: true,
              },
              { name: "Approx", value: `$${to_pay * usdpu}`, inline: true },
              { name: "Recipient", value: to.to_name, inline: true },
              {
                name: "Sender",
                value: `${donor.first_name} ${donor.last_name} <${donor.email}>`,
              },
            ],
          })
          .catch(report_null);
        console.info(
          "manual intent notification",
          res?.status,
          res?.statusText
        );
      }
      return await json_with_cookie(p, don.id);
    }

    const np_order: Order = {
      id: r_id,
      description: to.to_name,
      amount: to_pay,
      usdpu,
      currency: intent.currency,
    };

    const payment = await crypto_payment(
      np_order,
      `${base_url}/api/nowpayments-webhook`
    );

    return await json_with_cookie(payment, don.id);
  }

  if (via === "chariot") {
    const to_pay = amnt_sum(intent.amount);
    const grant = await chariot.create_grant({
      workflowSessionId: via_extra,
      amount: rd2num(to_pay * 100, 0), //in cents
    });

    const { don_id } = grant.metadata as unknown as ChariotMetadata;
    const date = new Date();

    const r: IDonation = {
      id: don_id,
      status: "intent",
      via,
      via_extra: grant.id,
      upusd: 1, // chariot only supports usd
      created_at: date.toISOString(),
      updated_at: date.toISOString(),
      ...to,
      ...from,
      ...intent,
    };

    const don = await donation_put(db, r);
    return await json_with_cookie({ id: don.id }, don.id);
  }

  if (via === "card" || via === "bank") {
    const upusd = await unit_per_usd(intent.currency);
    const base_usd = rd2num(intent.amount.base / upusd, 1);
    if (base_usd < MIN_DONATION_USD) return resp.status(400, "less than min");

    const customer_id = await customer_with_currency(
      intent.currency,
      donor.email
    );

    const r_id = crypto.randomUUID();
    const now = new Date().toISOString();
    const r: IDonation = {
      id: r_id,
      status: "created",
      via: "stripe",
      upusd,
      created_at: now,
      updated_at: now,
      ...to,
      ...from,
      ...intent,
    };
    const don = await donation_put(db, r);

    const bank_only = via === "bank";
    let client_secret: string;
    if (intent.frequency === "one-time") {
      client_secret = await payment_intent({
        ...don.amount,
        currency: don.currency,
        customer_id,
        order_id: don.id,
        bank_only,
      });
    } else {
      client_secret = await setup_intent(don.id, customer_id, bank_only);
    }

    const ret: IStripeIntentReturn = {
      client_secret,
      order_id: don.id,
    };
    return await json_with_cookie(ret, don.id);
  }

  if (via === "paypal") {
    const upusd = await unit_per_usd(intent.currency);
    const r_id = crypto.randomUUID();
    const now = new Date().toISOString();
    const r: IDonation = {
      id: r_id,
      status: "created",
      via,
      upusd,
      created_at: now,
      updated_at: now,
      ...to,
      ...from,
      ...intent,
    };
    const don = await donation_put(db, r);

    let tx_id: string;
    if (intent.frequency === "one-time") {
      tx_id = await create_order({
        order_id: don.id,
        currency: don.currency,
        npo_name: to.to_name,
        ...don.amount,
      });
    } else {
      tx_id = await create_subs({
        ...don.amount,
        order_id: don.id,
        freq: intent.frequency,
        currency: don.currency,
      });
    }

    return await json_with_cookie({ tx_id, don_id: don.id }, don.id);
  }
};
