import type { ActionFunction } from "react-router";
import * as v from "valibot";
import { redirectWithSuccess } from "#/.server/toast";
import type { IBalanceTx } from "@/balance-txs";
import { resp } from "@/helpers/https";
import type { IPayout } from "@/payouts";
import { db } from "$/pg/db";
import {
  bal_tx_get,
  bal_tx_put,
  bal_tx_update_status,
} from "$/pg/queries/bal-tx";
import {
  type INavLogAppendOpts,
  nav_log_append,
  nav_ltd,
} from "$/pg/queries/nav";
import { npo_balance_adj, npo_get } from "$/pg/queries/npo";
import { payout_put } from "$/pg/queries/payout";

const verdict_schema = v.picklist(["approve", "reject"]);
const tx_id_schema = v.pipe(
  v.string("required"),
  v.nonEmpty("tx id is required")
);

export const action: ActionFunction = async ({ params, request }) => {
  const fv = await request.formData();
  const p1 = v.safeParse(verdict_schema, fv.get("verdict"));
  if (p1.issues) return resp.status(400, p1.issues[0].message);
  const verdict = p1.output;
  const p2 = v.safeParse(tx_id_schema, params.tx_id);
  if (p2.issues) return resp.status(400, p2.issues[0].message);
  const tx_id = p2.output;

  const timestamp = new Date().toISOString();

  const tx = await bal_tx_get(tx_id);
  if (!tx) return { status: 404 };

  if (tx.account !== "lock") throw `expected lock account, got ${tx.account}`;

  const ltd = await nav_ltd();

  if (ltd.composition.CASH.value < tx.amount) {
    throw "insufficient cash balance to approve this request.";
  }

  if (verdict === "reject") {
    await db.transaction(async (pg) => {
      await bal_tx_update_status(pg, tx.id, "cancelled");
      //add back units
      await npo_balance_adj(pg, tx.npo_id, {
        lock_units: tx.amount_units,
      });
    });
    return redirectWithSuccess("..", "Request rejected");
  }

  // units adjustment based on ltd
  const units_curr = tx.amount / ltd.price;
  const units_bal = ltd.holders[tx.npo_id] || 0;
  /** if units price go up, fewer units would be sold, and more otherwise */
  const units_to_deduct = Math.min(units_curr, units_bal);
  const usd_to_deduct = units_to_deduct * ltd.price;
  const units_diff = tx.amount_units - units_to_deduct;

  // redemptions are from cash portion
  const nav_delta: INavLogAppendOpts = {
    reason: `npo:${tx.npo_id} units redemption with units diff:${units_diff}`,
    date: timestamp,
    cash_delta: -usd_to_deduct,
    holder_deltas: [{ npo_id: tx.npo_id, units_delta: -units_to_deduct }],
  };

  //transfer to savings
  if (tx.account_other === "liq") {
    const npo_item = await npo_get(tx.npo_id);
    const liq_bal = npo_item?.liq ?? 0;
    const liq_tx: IBalanceTx = {
      id: crypto.randomUUID(),
      date_created: timestamp,
      date_updated: timestamp,
      npo_id: tx.npo_id,
      status: "final",
      account: "liq",
      bal_begin: liq_bal,
      bal_end: liq_bal + tx.amount,
      amount: tx.amount,
      amount_units: tx.amount,
      account_other_id: tx.id,
      account_other: "lock",
      account_other_bal_begin: tx.bal_begin,
      account_other_bal_end: tx.bal_begin - tx.amount_units,
    };

    await db.transaction(async (pg) => {
      await bal_tx_update_status(pg, tx.id, "final");
      await nav_log_append(pg, nav_delta);
      await bal_tx_put(pg, liq_tx);
      // combine lock_units adjustment with liq update to avoid multiple operations on same item
      await npo_balance_adj(pg, tx.npo_id, {
        liq: tx.amount,
        lock_units: units_diff, // reflect unused/extra units if price goes higher
      });
    });

    return redirectWithSuccess("..", "Request approved");
  }

  //transfer to grant
  const payout: IPayout = {
    id: crypto.randomUUID(),
    source_id: tx.id,
    npo_id: tx.npo_id,
    source: "lock",
    date: timestamp,
    amount: tx.amount,
    type: "pending",
  };

  await db.transaction(async (pg) => {
    await bal_tx_update_status(pg, tx.id, "final");
    await nav_log_append(pg, nav_delta);
    await payout_put(pg, payout);
    // combine lock_units adjustment with payout updates to avoid multiple operations on same item
    await npo_balance_adj(pg, tx.npo_id, {
      cash: tx.amount,
      lock_units: units_diff, // reflect unused/extra units if price goes higher
    });
  });

  return redirectWithSuccess("..", "Request approved");
};
