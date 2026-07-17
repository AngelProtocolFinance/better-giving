import { tokens_map } from "@better-giving/crypto";
import { calc_donation_settle, type ISettlement } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { np } from "$/kit/nowpayments";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";

/**
 * fees, outcomes, are all denominated in the same currency
 * settlement currency is USDC ( set in account), regardless of chain
 * fiat equivalents (actual_paid_amount_fiat) in "usd" set in account
 *
 */
export const handle_settled = async (payment: NP.PaymentPayload) => {
  const { usdpu: outcome_usdpu } = await np.estimate(payment.outcome_currency);
  const outcome_token = tokens_map[payment.outcome_currency.toUpperCase()];
  /** all in usd */
  const settlement: ISettlement = {
    id: payment.payment_id.toString(),
    date: new Date().toISOString(),
    net: payment.outcome_amount * outcome_usdpu,
    fee:
      payment.fee.depositFee +
      payment.fee.serviceFee +
      payment.fee.withdrawalFee,
    currency: outcome_token.code,
  };

  const prior = await donation_get(payment.order_id);
  if (!prior) throw new Error(`donation not found: ${payment.order_id}`);

  const result = calc_donation_settle({
    kind: "one-time",
    order_id: payment.order_id,
    prior,
    settlement,
  });
  if (result.op !== "update")
    throw new Error("unexpected put for nowpayments one-time");

  const order = await db.transaction((tx) =>
    donation_update(tx, result.order_id, result.patch)
  );
  await enqueue(...result.msgs);

  return { id: order.id };
};
