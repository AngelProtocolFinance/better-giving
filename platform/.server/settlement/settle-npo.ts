import { calc_settlement_plan } from "@/settlement/plan";
import type { IInput } from "@/types/donation-dist";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import { dist_put } from "$/pg/queries/dist";
import { donation_message_put } from "$/pg/queries/donation-message";
import { form_ltd_inc } from "$/pg/queries/form";
import type { DbOrTx } from "$/pg/queries/helpers";
import { nav_log_append } from "$/pg/queries/nav";
import { npo_balance_update, npo_get } from "$/pg/queries/npo";
import { payout_put } from "$/pg/queries/payout";
import { npo_prog_contrib } from "$/pg/queries/program";
import { commission_put } from "$/pg/queries/referrer";
import { rev_log_put } from "$/pg/queries/revenue";

export async function settle_npo(db: DbOrTx, i: IInput) {
  const npo = await npo_get(+i.id, db);
  if (!npo) throw new Error(`npo:${i.id} not found`);
  if (npo.active === false) {
    console.warn(`npo:${i.id} inactive, skipping settlement`);
    return { msgs: [], txs: [] };
  }

  const plan = calc_settlement_plan(i, {
    id: npo.id,
    name: npo.name,
    claimed: npo.claimed,
    fiscal_sponsored: npo.fiscal_sponsored,
    hide_bg_tip: npo.hide_bg_tip,
    allocation: npo.allocation,
    lock_units: npo.lock_units,
    liq: npo.liq,
    referrer_user: npo.referrer_user,
    referrer_npo: npo.referrer_npo,
    referrer_expiry: npo.referrer_expiry,
  });

  const { dist, don } = plan;
  const txs: unknown[] = [];

  // dist insert first — unique(donation_id, to_id) acts as idempotency guard.
  // on duplicate, PG throws 23505 → transaction rolls back → caller handles it.
  const dist_row = {
    id: don.id,
    donation_id: i.prnt.id,
    status: "settled" as const,
    date_created: don.created_at,
    to_id: +don.to_id,
    to_name: don.to_name,
    to_claimed: npo.claimed,
    to_fiscal_sponsored: dist.to_settings.fiscal_sponsored,
    amount: don.amount.base,
    amount_usd: don.amount.base / don.upusd,
    amount_denom: don.currency,
    net: dist.net,
    fee_base: dist.fees.base,
    fee_fsa: dist.fees.fsa,
    fee_processing: dist.fees.processing,
    fee_allowance: dist.fee_allowance,
    fee_allowance_excess: dist.fee_allowance_excess,
    alloc: dist.to_settings.alloc,
    fund_id: i.prnt.type === "fund" ? i.prnt.to_id : null,
  };
  txs.push(dist_row);
  await dist_put(db, dist_row);

  for (const log of plan.revenue_logs) {
    txs.push(log);
    await rev_log_put(db, log);
  }

  if (plan.commission) {
    txs.push(plan.commission);
    await commission_put(db, plan.commission);
  }

  if (plan.nav_log_entry) await nav_log_append(db, plan.nav_log_entry);

  for (const tx of plan.balance_txs) {
    txs.push(tx);
    await bal_tx_put(db, tx);
  }

  if (plan.payout) {
    txs.push(plan.payout);
    await payout_put(db, plan.payout);
  }

  if (i.tx.from_public) {
    // fa_added = net + bg/fsa fees (recovers credit_fa output from dist)
    const fa_added = dist.net + dist.fees.base + dist.fees.fsa;
    await donation_message_put(db, {
      id: don.id,
      donation_id: i.prnt.id,
      date: i.sttl.date,
      donor_message: i.tx.from_public_msg_to_npo ?? "",
      donor_name: i.tx.from_name || "Anonymous",
      npo_id: npo.id.toString(),
      amount: fa_added,
    });
  }

  // fund_contrib derived via v_donation_total_usd view — no explicit increment

  if (i.source) await form_ltd_inc(db, i.source.id, dist.net, 1);
  if (i.program) await npo_prog_contrib(db, i.program.id, dist.net);

  await npo_balance_update(db, +i.id, plan.balance_deltas, "inc");

  console.info(`settled npo ${i.id}, dist ${don.id}`);

  return { msgs: plan.msgs, txs };
}
