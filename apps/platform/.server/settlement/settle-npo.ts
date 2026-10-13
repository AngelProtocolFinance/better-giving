import { country_code } from "#/constants/countries";
import { report_error } from "#/errors/report";
import { is_reversed } from "@/donations/settle";
import { type IDonDistPayload, type IMsg, msg } from "@/queue";
import {
  calc_settlement_plan,
  type NpoSettlementContext,
  type PooledSettlementPlan,
  transfer_msg,
} from "@/settlement/plan";
import { is_routable } from "@/stripe-connect/eligibility";
import type { IInput } from "@/types/donation-dist";
import { stripe as stripe_env } from "$/env";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import {
  dist_of,
  dist_put,
  dists_routed_untransferred,
} from "$/pg/queries/dist";
import { donation_status_shared } from "$/pg/queries/donation";
import { donation_message_put } from "$/pg/queries/donation-message";
import { form_ltd_inc } from "$/pg/queries/form";
import type { DbOrTx } from "$/pg/queries/helpers";
import { nav_log_append } from "$/pg/queries/nav";
import {
  type INpo,
  npo_balance_update,
  npo_get,
  npo_get_locked,
} from "$/pg/queries/npo";
import { payout_put } from "$/pg/queries/payout";
import { npo_prog_contrib } from "$/pg/queries/program";
import { commission_put } from "$/pg/queries/referrer";
import { rev_log_put } from "$/pg/queries/revenue";
import { owe_takes } from "$/refund/takes";

const plan_ctx = (npo: INpo): NpoSettlementContext => ({
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

/**
 * the connected account this share settles to, or null to settle it pooled:
 * money stripe took, for an npo that can receive it now. decided on the locked
 * row, so a disconnect that commits first is seen
 */
const routed_to = (i: IInput, npo: INpo): string | null =>
  // every rail but stripe settles money that never touched our stripe balance
  i.tx.via.startsWith("stripe") &&
  is_routable(
    { ...npo, hq_country_code: country_code(npo.hq_country) },
    stripe_env.connect_routing
  )
    ? npo.stripe_account_id
    : null;

/** the npo's share lands in bg's books: its balances and a pending payout */
async function book_pooled(
  db: DbOrTx,
  npo_id: number,
  plan: PooledSettlementPlan,
  txs: unknown[]
) {
  if (plan.nav_log_entry) await nav_log_append(db, plan.nav_log_entry);

  for (const tx of plan.balance_txs) {
    txs.push(tx);
    await bal_tx_put(db, tx);
  }

  if (plan.payout) {
    txs.push(plan.payout);
    await payout_put(db, plan.payout);
  }

  await npo_balance_update(db, npo_id, plan.balance_deltas, "inc");
}

/**
 * the msgs of an npo share already settled, for a redelivery to resend when
 * the first delivery may have died between its commit and its enqueue. only
 * `don-dist` is resent — its handler's notice claim on the dist row runs each
 * step once. `tip-received` and `lock-tx-created` mail ops with no send-once
 * gate, and qstash's dedupe holds only inside its window, so a resend would
 * mail them twice. `connect-transfer` is resent for a routed dist no transfer
 * has paid, read off the row: its handler's stored transfer and stripe
 * idempotency key pay it once.
 *
 * the msgs come from a replan, read without a lock: its ids are minted afresh
 * and its figures follow the npo's terms now, not at settlement. so `id` is the
 * stored dist's, which the notice claim and the dedupe key are on, and so is
 * `net`.
 */
export async function settled_npo_msgs(db: DbOrTx, i: IInput): Promise<IMsg[]> {
  const dist = await dist_of(i.prnt.id, +i.id, db);
  if (!dist) throw new Error(`dist for npo:${i.id} vanished after settling`);
  const npo = await npo_get(+i.id, db);
  if (!npo) throw new Error(`npo:${i.id} not found`);
  const plan = calc_settlement_plan(i, plan_ctx(npo));
  const notice = plan.msgs.flatMap((m) => {
    if (m.id !== "don-dist") return [];
    const p = m.payload as IDonDistPayload;
    return [msg("don-dist", { ...p, id: dist.id, net: dist.net ?? p.net })];
  });
  // a fund's other members resend their own
  const unpaid = (await dists_routed_untransferred(i.prnt.id, db)).filter(
    (d) => d.id === dist.id
  );
  return [...notice, ...unpaid.map((d) => transfer_msg(i, d.id))];
}

export async function settle_npo(db: DbOrTx, i: IInput) {
  // the payload's status can predate a refund; the row's is what counts.
  const status = await donation_status_shared(db, i.prnt.id);
  if (status && is_reversed(status)) {
    console.info(
      `skipped npo ${i.id}: donation ${i.prnt.id} is ${status}, no dist written`
    );
    return { msgs: [], txs: [] };
  }

  // the plan's bal_begin/bal_end come from this row: a concurrent settlement
  // of the same npo waits here instead of planning from the same balance
  const npo = await npo_get_locked(db, +i.id);
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

  const plan = calc_settlement_plan(i, plan_ctx(npo), routed_to(i, npo));

  if (plan.alloc_fell_back) {
    report_error(
      new Error(`npo:${npo.id} stored allocation invalid, settled to default`),
      { npo_id: npo.id, allocation: npo.allocation, during: "settle_npo" }
    );
  }

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
    ...(plan.kind === "routed" && { stripe_routed_to: plan.routed_to }),
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

  // a routed plan carries none of what this books: the transfer that pays it
  // runs after the commit, off the msg the plan carries
  if (plan.kind === "pooled") await book_pooled(db, +i.id, plan, txs);

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

  // a dispute or refund recorded before this dist existed owed nothing for it
  await owe_takes(db, i.prnt.id, new Date().toISOString());

  console.info(`settled npo ${i.id}, dist ${don.id}`);

  return { msgs: plan.msgs, txs };
}
