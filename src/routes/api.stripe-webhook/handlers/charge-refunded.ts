import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import type { IBalanceTx } from "@/balance-txs";
import { report_error } from "@/errors/report";
import type { IRefundedLossStatus, IRefundedStatus } from "@/payouts";
import type { ILossLog } from "@/revenue";
import type { IBalanceDeltas } from "@/types/donation";
import { stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import {
  type DistRefundGraph,
  dist_refund_update,
  dists_for_refund,
} from "$/pg/queries/dist";
import { donation_get, donation_update } from "$/pg/queries/donation";
import { donation_message_del } from "$/pg/queries/donation-message";
import { form_ltd_inc } from "$/pg/queries/form";
import { nav_log_append, nav_ltd } from "$/pg/queries/nav";
import { npo_balance_update, npo_get } from "$/pg/queries/npo";
import { payout_update } from "$/pg/queries/payout";
import { npo_prog_contrib } from "$/pg/queries/program";
import { commission_update_status } from "$/pg/queries/referrer";
import { loss_log_put, rev_log_update_status } from "$/pg/queries/revenue";

export async function handle_charge_refunded({
  object: charge,
}: Stripe.ChargeRefundedEvent.Data) {
  const intent_id = str_id(charge.payment_intent);
  const intent = await stripe.paymentIntents.retrieve(intent_id);
  const { order_id } = intent.metadata;
  if (!order_id)
    throw new Error(`missing order_id in intent metadata: ${intent_id}`);

  const don = await donation_get(order_id);
  if (!don) throw new Error(`donation not found: ${order_id}`);
  if (don.status === "refunded" || don.status === "refunded_loss") {
    console.info(`already refunded: ${order_id}`);
    return;
  }

  const graphs = await dists_for_refund(order_id);
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${order_id}`);
  }

  const failures: string[] = [];
  const loss_msgs: string[] = [];

  for (const g of graphs) {
    try {
      const loss = await apply_refund(
        g,
        don.form_id ?? null,
        don.program?.id ?? null
      );
      const status = loss ? "loss" : "completed";
      await dist_refund_update(db, g.dist.id, { refund_status: status });

      if (loss) {
        loss_msgs.push(`npo ${g.dist.to_id}: $${loss.amount} — ${loss.reason}`);
      }
      console.info(
        `dist ${g.dist.id} refunded for npo ${g.dist.to_id} (${status})`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await dist_refund_update(db, g.dist.id, {
        refund_status: "failed",
        refund_error: msg,
      }).catch((e) => report_error(e, { dist_id: g.dist.id }));
      failures.push(`dist ${g.dist.id}: ${msg}`);
      report_error(err, { dist_id: g.dist.id, order_id });
    }
  }

  const has_loss = loss_msgs.length > 0;
  await donation_update(db, order_id, {
    status: has_loss ? "refunded_loss" : "refunded",
  });

  // losses are finance-ops notices (not bugs) — keep discord; failures already
  // went to sentry inline at the throw site.
  if (loss_msgs.length > 0) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `charge-refunded-${stage}`,
      title: "Refund Completed with Losses",
      body: `LOSSES:\n${loss_msgs.join("\n")}`,
    });
  }

  console.info(
    `charge refunded: ${order_id}, dists: ${graphs.length}, failures: ${failures.length}, losses: ${loss_msgs.length}`
  );
}

/** returns loss if any pre-flight check fails; undefined = full reversal */
async function apply_refund(
  g: DistRefundGraph,
  form_id: string | null,
  program_id: string | null
): Promise<ILossLog | undefined> {
  const { dist } = g;
  const npo_id = dist.to_id ?? 0;

  // derive balance deltas from dist allocation
  const alloc = dist.alloc ?? { liq: 0, lock: 0, cash: 0 };
  const net = dist.net ?? 0;
  const balance_deltas: IBalanceDeltas = {
    liq: (alloc.liq / 100) * net,
    lock: (alloc.lock / 100) * net,
    lock_units: 0, // recomputed below at current NAV
    cash: (alloc.cash / 100) * net,
  };

  const needs_nav = balance_deltas.lock > 0;
  const [npo_item, nav] = await Promise.all([
    npo_get(npo_id),
    needs_nav ? nav_ltd() : undefined,
  ]);
  if (!npo_item) throw new Error(`npo:${npo_id} not found`);
  const bal = {
    liq: npo_item.liq ?? 0,
    lock_units: npo_item.lock_units ?? 0,
    cash: npo_item.cash ?? 0,
  };

  // recompute lock_units at current NAV price
  const refund_lock_units = nav ? balance_deltas.lock / nav.price : 0;
  const refund_deltas = { ...balance_deltas, lock_units: refund_lock_units };

  // pre-flight checks
  const check_reasons: string[] = [];
  if (balance_deltas.liq > 0 && bal.liq < balance_deltas.liq) {
    check_reasons.push(`liq: has $${bal.liq}, need $${balance_deltas.liq}`);
  }
  if (balance_deltas.lock > 0 && bal.lock_units < refund_lock_units) {
    check_reasons.push(
      `lock: has ${bal.lock_units}u, need ${refund_lock_units}u`
    );
  }
  if (balance_deltas.cash > 0 && g.payout) {
    if (g.payout.type !== "pending") {
      check_reasons.push(
        `payout ${g.payout.id} is ${g.payout.type ?? "missing"}`
      );
    }
  }

  const is_loss = check_reasons.length > 0;
  const now = new Date().toISOString();

  let loss: ILossLog | undefined;

  await db.transaction(async (tx) => {
    // balance/payout/NAV — only when fully reversible
    if (!is_loss) {
      await npo_balance_update(tx, npo_id, refund_deltas, "dec");

      // refund balance tx records
      if (balance_deltas.liq > 0) {
        const liq_tx: IBalanceTx = {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: npo_id,
          account: "liq",
          bal_begin: bal.liq,
          bal_end: bal.liq - balance_deltas.liq,
          amount: balance_deltas.liq,
          amount_units: balance_deltas.liq,
          status: "final",
          account_other_id: dist.id,
          account_other: "refund",
          account_other_bal_begin: 0,
          account_other_bal_end: balance_deltas.liq,
        };
        await bal_tx_put(tx, liq_tx);
      }

      if (balance_deltas.lock > 0 && nav) {
        const lock_usd = refund_lock_units * nav.price;
        const lock_tx: IBalanceTx = {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: npo_id,
          account: "lock",
          bal_begin: bal.lock_units,
          bal_end: bal.lock_units - refund_lock_units,
          amount: lock_usd,
          amount_units: refund_lock_units,
          status: "final",
          account_other_id: dist.id,
          account_other: "refund",
          account_other_bal_begin: 0,
          account_other_bal_end: lock_usd,
        };
        await bal_tx_put(tx, lock_tx);
      }

      if (g.payout) {
        await payout_update(tx, g.payout.id, {
          type: "refunded",
        } as IRefundedStatus);
      }

      if (nav) {
        await nav_log_append(tx, {
          reason: `refund npo:${npo_id}`,
          date: now,
          cash_delta: -balance_deltas.lock,
          holder_deltas: [{ npo_id, units_delta: -refund_lock_units }],
        });
      }
    }

    const refund_status = is_loss ? "refunded_loss" : "refunded";

    // revenue — always reversed
    for (const rl of g.rev_logs) {
      await rev_log_update_status(tx, rl.id, refund_status);
    }

    // referral commissions — always reversed
    if (g.commission) {
      await commission_update_status(
        tx,
        g.commission.donation_id,
        refund_status
      );
    }

    // fund contrib derived via view — no decrement needed
    if (form_id) await form_ltd_inc(tx, form_id, -net, -1);
    if (program_id) await npo_prog_contrib(tx, program_id, -net);

    await donation_message_del(tx, dist.donation_id);

    if (is_loss && g.payout) {
      await payout_update(tx, g.payout.id, {
        type: "refunded_loss",
      } as IRefundedLossStatus);
    }

    // record loss
    if (is_loss) {
      loss = {
        id: crypto.randomUUID(),
        date: now,
        donation_id: dist.donation_id,
        dist_id: dist.id,
        npo_id: npo_id,
        type: check_reasons[0].startsWith("liq")
          ? "balance_liq"
          : check_reasons[0].startsWith("lock")
            ? "balance_lock"
            : "payout",
        amount: dist.amount ?? 0,
        npo_amount: net,
        fees_bg: (dist.fee_base ?? 0) + (dist.fee_fsa ?? 0),
        fees_processing: dist.fee_processing ?? 0,
        reason: check_reasons.join("; "),
      };
      await loss_log_put(tx, loss);
    }
  });

  return loss;
}
