import { type IToken, is_custom, tokens_map } from "@better-giving/crypto";
import { report_error, report_null } from "#/errors/report";
import type { Payment } from "#/types/crypto";
import type { IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { resp } from "@/helpers/https";
import { donation_quote } from "@/nowpayments/min";
import { deposit_addr } from "$/deposit-addr";
import { base_url } from "$/env";
import { coingecko } from "$/kit/coingecko";
import { aws_monitor } from "$/kit/discord";
import { np } from "$/kit/nowpayments";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Ctx, Provider } from "../types";
import { crypto_payment } from "./np-payment";

const min_msg = (min: number, t: IToken) =>
  `This amount is below the minimum of ${min} ${t.code}. Try a larger amount or a different currency.`;

export const crypto_intent: Provider = async (ctx) => {
  const token = tokens_map[ctx.intent.currency];
  if (!token) {
    console.info(
      `[resp] 400 - unknown crypto currency: ${ctx.intent.currency}`
    );
    return resp.txt(
      "This currency isn't supported. Choose a different currency.",
      400
    );
  }
  return is_custom(token.id)
    ? custom_intent(ctx, token)
    : np_intent(ctx, token);
};

const to_row = (
  { to, from, via, intent }: Ctx,
  t: IToken,
  id: string,
  usdpu: number
): IDonation => {
  const now = new Date().toISOString();
  return {
    id,
    status: "intent",
    via: `${via}:${t.network}`,
    upusd: 1 / usdpu,
    created_at: now,
    updated_at: now,
    ...to,
    ...from,
    ...intent,
  };
};

async function custom_intent(c: Ctx, token: IToken) {
  const res = await coingecko((x) => {
    x.pathname = `api/v3/simple/price?ids=${token.cg_id}&vs_currencies=usd`;
    return x;
  });
  if (!res.ok) throw res;
  const {
    [token.cg_id]: { usd: usdpu },
  } = await res.json();

  const to_pay = amnt_sum(c.intent.amount);
  const min = 1 / usdpu;
  if (to_pay < min) return resp.txt(min_msg(min, token), 400);

  const r_id = crypto.randomUUID();
  const don = await donation_put(db, {
    ...to_row(c, token, r_id, usdpu),
    via_extra: r_id,
  });

  const p: Payment = {
    id: r_id,
    order_id: r_id,
    address: deposit_addr(token.network),
    amount: to_pay,
    currency: token.code,
    description: c.to.to_name,
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
          { name: "Recipient", value: c.to.to_name, inline: true },
          {
            name: "Sender",
            value: `${c.donor.first_name} ${c.donor.last_name} <${c.donor.email}>`,
          },
        ],
      })
      .catch(report_null);
    console.info("manual intent notification", res?.status, res?.statusText);
  }
  return { don_id: don.id, body: p };
}

/** `payment` is null when the donor's amount is under `min` */
async function np_payment(
  c: Ctx,
  token: IToken,
  order_id: string,
  to_pay: number
) {
  const q = await donation_quote(np, token.code);
  if (to_pay < q.min) return { ...q, payment: null };

  const payment = await crypto_payment(
    {
      id: order_id,
      description: c.to.to_name,
      amount: to_pay,
      usdpu: q.usdpu,
      currency: token.code,
    },
    new URL("/api/nowpayments-webhook", base_url).toString()
  );
  return { ...q, payment };
}

async function np_intent(c: Ctx, token: IToken) {
  const to_pay = amnt_sum(c.intent.amount);
  // the id goes to nowpayments as `order_id` before the row exists, so a
  // failed invoice leaves nothing behind
  const r_id = crypto.randomUUID();

  let q: Awaited<ReturnType<typeof np_payment>>;
  try {
    q = await np_payment(c, token, r_id, to_pay);
  } catch (err) {
    report_error(err, { order_id: r_id, currency: token.code });
    return resp.txt(
      "We couldn't reach our crypto payment processor. Please try again in a few minutes.",
      502
    );
  }

  if (!q.payment) return resp.txt(min_msg(q.min, token), 400);
  // nowpayments converts `price_amount` back at its own rate; under the pair
  // floor the deposit lands `failed` or `partially_paid`
  if (q.payment.amount < q.floor) {
    console.info(
      `[resp] 400 - pay_amount ${q.payment.amount} under floor ${q.floor} order:${r_id}`
    );
    return resp.txt(min_msg(q.min, token), 400);
  }

  const don = await donation_put(db, {
    ...to_row(c, token, r_id, q.usdpu),
    // the `waiting` ipn can land before this put, so the resume id can't wait for it
    via_extra: String(q.payment.id),
  });
  return { don_id: don.id, body: q.payment };
}
