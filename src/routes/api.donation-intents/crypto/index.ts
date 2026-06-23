import { is_custom, tokens_map } from "@better-giving/crypto";
import type { Payment } from "#/types/crypto";
import type { IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { report_null } from "@/errors/report";
import { resp } from "@/helpers/https";
import { deposit_addr } from "$/deposit-addr";
import { base_url } from "$/env";
import { coingecko } from "$/kit/coingecko";
import { aws_monitor } from "$/kit/discord";
import { np } from "$/kit/nowpayments";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";
import { crypto_payment, type Order } from "./np-payment";

export const crypto_intent: Provider = async ({
  to,
  from,
  donor,
  via,
  intent,
}) => {
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
      console.info("manual intent notification", res?.status, res?.statusText);
    }
    return { don_id: don.id, body: p };
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

  return { don_id: don.id, body: payment };
};
