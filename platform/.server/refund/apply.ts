import type { IRefundedLossStatus, IRefundedStatus } from "@/payouts";
import type { ILossLog } from "@/revenue";
import { bal_tx_put } from "../pg/queries/bal-tx";
import { donation_message_del } from "../pg/queries/donation-message";
import { form_ltd_inc } from "../pg/queries/form";
import type { DbOrTx } from "../pg/queries/helpers";
import { nav_log_append } from "../pg/queries/nav";
import { npo_balance_update } from "../pg/queries/npo";
import { payout_update } from "../pg/queries/payout";
import { npo_prog_contrib } from "../pg/queries/program";
import { commission_update_status } from "../pg/queries/referrer";
import { loss_log_put, rev_log_update_status } from "../pg/queries/revenue";
import type { RefundPlan } from "./plan";

export async function apply_refund_plan(
  tx: DbOrTx,
  plan: RefundPlan
): Promise<ILossLog | undefined> {
  let loss: ILossLog | undefined;

  for (const e of plan.effects) {
    switch (e.kind) {
      case "balance_update":
        await npo_balance_update(tx, e.npo_id, e.deltas, "dec");
        break;
      case "bal_tx_put":
        await bal_tx_put(tx, e.tx);
        break;
      case "nav_log":
        await nav_log_append(tx, e.entry);
        break;
      case "payout_status":
        await payout_update(
          tx,
          e.payout_id,
          e.status === "refunded"
            ? ({ type: "refunded" } as IRefundedStatus)
            : ({ type: "refunded_loss" } as IRefundedLossStatus)
        );
        break;
      case "rev_log_status":
        await rev_log_update_status(tx, e.rev_log_id, e.status);
        break;
      case "commission_status":
        await commission_update_status(tx, e.donation_id, e.status);
        break;
      case "form_decrement":
        await form_ltd_inc(tx, e.form_id, -e.net, -1);
        break;
      case "program_decrement":
        await npo_prog_contrib(tx, e.program_id, -e.net);
        break;
      case "donation_message_del":
        await donation_message_del(tx, e.donation_id);
        break;
      case "loss_log":
        loss = e.loss;
        await loss_log_put(tx, e.loss);
        break;
    }
  }

  return loss;
}
