import { tokens_map } from "@better-giving/crypto";
import type { IDonationSettled, ISettlement } from "@/donations";
import type { NP } from "@/nowpayments/types";
import * as don_sttl_dist from "@/queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "@/queue/msgs/don-sttl-receipt";
import { np } from "$/kit/nowpayments";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

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

  const order = await db.transaction(async (tx) => {
    return donation_update(tx, payment.order_id, {
      status: "settled",
      settlement,
    });
  });
  await enqueue(
    don_sttl_dist.to_msg(order as IDonationSettled),
    don_sttl_receipt.to_msg(order)
  );

  return { id: order.id };
};
