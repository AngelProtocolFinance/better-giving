import { report_error } from "@/errors/report";
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
    // the destinations are resolved before the transaction opens and this
    // re-reads inside it, so a member that deactivates in that gap lands here.
    // the donor's money is already banked; the parent donation records the full
    // net while the distributions behind it sum to less, and this share is
    // settled to nobody.
    //
    // the decision is to leave it undistributed rather than throw. throwing
    // would roll the transaction back and 500 the queue handler, which retries
    // — and the recipient is not coming back inside a retry window, so the gift
    // would sit in a redelivery loop instead of reaching the other members of
    // the fund.
    //
    // nor does the share need moving anywhere: it is already sitting in better
    // giving's own stripe balance, which is where an undistributed share stays.
    // so there is nothing to book and no ledger to invent — the only thing that
    // was missing is someone knowing, which is why this reports rather than
    // warns. re-granting it is a manual decision about a recipient that no
    // longer exists, and that is not a decision this path can make.
    //
    // unchanged and separate: an admin picking an inactive npo directly in the
    // settlement form reaches the same place, and wants refusing at the
    // selector instead of arriving here.
    report_error(
      new Error(`npo:${i.id} inactive at settlement, share not distributed`),
      { npo_id: i.id, donation_id: i.prnt.id, during: "settle_npo" }
    );
    return { msgs: [], txs: [] };
  }

  const plan = calc_settlement_plan(i, {
    id: npo.id,
    name: npo.name,
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
