import { tokens_map } from "@better-giving/crypto";
import type { LoaderFunction } from "react-router";
import {
  integer,
  minValue,
  parse,
  pipe,
  string,
  transform,
  union,
  uuid,
} from "valibot";
import type { Payment } from "#/types/crypto";
import { amnt_sum } from "@/donations/helpers";
import { resp } from "@/helpers/https";
import { deposit_addr } from "$/deposit-addr";
import { np } from "$/kit/nowpayments";
import { donation_get } from "$/pg/queries/donation";

const int = pipe(
  string(),
  transform((x) => +x),
  integer(),
  minValue(0)
);
export const loader: LoaderFunction = async ({ params }) => {
  const id = parse(union([pipe(string(), uuid()), int]), params.id);

  if (typeof id === "number") {
    const p = await np.get_payment_invoice(id);
    if (p.payment_status !== "waiting") throw resp.status(410);

    const estimated = await np.estimate(p.pay_currency);

    return {
      id: p.payment_id,
      address: p.pay_address,
      amount: p.pay_amount,
      currency: p.pay_currency.toUpperCase(),
      usdpu: estimated.usdpu,
      description: p.order_description,
      order_id: p.order_id,
    } satisfies Payment;
  }

  const don = await donation_get(id);
  if (!don) return resp.status(404);
  if (don.status !== "intent") return resp.status(410);

  const token = tokens_map[don.currency];
  const addr = deposit_addr(token.network);

  if (!addr) return 500;

  const total = amnt_sum(don.amount);
  const data: Payment = {
    order_id: don.id,
    id: don.id,
    address: addr,
    amount: total,
    currency: don.currency,
    description: `Donation to ${don.to_name}`,
    usdpu: 1 / don.upusd,
  };
  return resp.json(data);
};
