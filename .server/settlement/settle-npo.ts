import type { IBalanceTx } from "@/balance-txs";
import { fees } from "@/constants";
import { default_allocation } from "@/constants/common";
import type { IDonation, IDonationDist, IToSettings } from "@/donations";
import type { IAllocation } from "@/npo";
import type { IPayout } from "@/payouts";
import * as don_dist from "@/queue/msgs/don-dist";
import * as lock_tx_created from "@/queue/msgs/lock-tx-created";
import * as tip_received from "@/queue/msgs/tip-received";
import type { IMsg } from "@/queue/types";
import type { ICommission } from "@/referrals";
import type { IRevenueLog } from "@/revenue";
import type { IBalanceDeltas } from "@/types/donation";
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
import { referral_commission_rate } from "./config";
import { credit_fa, debit_pcfs } from "./helpers";

export async function settle_npo(db: DbOrTx, i: IInput) {
  const msgs: IMsg[] = [];
  const txs: unknown[] = [];
  const npo = await npo_get(+i.id, db);
  if (!npo) throw new Error(`npo:${i.id} not found`);
  if (npo.active === false) {
    console.warn(`npo:${i.id} inactive, skipping settlement`);
    return { msgs, txs: [] };
  }

  const [fa_added, fa_excess] = credit_fa(i.ps.sttl.base, {
    fa: i.ps.sttl_fa.base,
    pf: i.ps.sttl_fee.base,
  });

  const [tip, tip_fa_excess] = credit_fa(i.ps.sttl.tip, {
    fa: i.ps.sttl_fa.tip,
    pf: i.ps.sttl_fee.tip,
  }); // no further deductions on tip: since tip goes to BG (non-fsa, base fee not applicable)

  const [net, pcfs] = debit_pcfs(fa_added, {
    base: npo.hide_bg_tip ? fees.base : 0,
    fsa: npo.fiscal_sponsored ? fees.fiscal_sponsor : 0,
  });

  const settings: IToSettings = {
    fiscal_sponsored: npo.fiscal_sponsored,
    alloc: npo.allocation ?? default_allocation,
  };

  const dist: IDonationDist = {
    id: i.sttl.id,
    gross: i.ps.sttl.base,
    net,
    currency: i.sttl.currency,
    fees: { ...pcfs, processing: i.ps.sttl_fee.base },
    fee_allowance: i.ps.sttl_fa.base,
    fee_allowance_excess: fa_excess,
    parent: i.prnt,
    to_settings: settings,
  };
  if (i.source) dist.form_tag = i.source.tag;

  const date = new Date(i.sttl.date);
  const id = crypto.randomUUID();
  const don: IDonation = {
    id,
    // tip is extracted from donation
    amount: { tip: 0, fee_allowance: i.ps.fa.base, base: i.ps.amnt.base },
    created_at: date.toISOString(),
    to_id: i.id.toString(),
    to_name: npo.name,
    to_type: "npo",
    to_tip_allowed: npo.hide_bg_tip ?? false,
    // settlement records has empty to_members
    to_members: [],
    dist,
    form_id: i.source?.id,
    program: i.program,
    ...i.tx,
  };

  // dist insert first — unique(donation_id, to_id) acts as idempotency guard.
  // on duplicate, PG throws 23505 → transaction rolls back → caller handles it.
  const dist_row = {
    id,
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

  // determine if referrer commission applies
  const referrer_id = npo.referrer_user ?? npo.referrer_npo;
  const has_referrer =
    referrer_id &&
    npo.referrer_expiry &&
    new Date(npo.referrer_expiry) >= new Date();

  const cf_from_tip = has_referrer ? tip * referral_commission_rate : 0;
  if (tip > 0) {
    const log: IRevenueLog = {
      id: crypto.randomUUID(),
      status: "final",
      date: i.sttl.date,
      donation_id: id,
      npo_id: +i.id,
      fund_id: null,
      npo_name: npo.name,
      type: "tip",
      gross: tip,
      commission: cf_from_tip,
      revenue: tip - cf_from_tip,
      type_tip: {
        denom: i.tx.currency,
        input: i.ps.amnt.tip,
        input_usd: i.ps.amnt_usd.tip,
        pf: i.ps.sttl_fee.tip,
        fa_excess: tip_fa_excess,
      },
    };
    txs.push(log);
    await rev_log_put(db, log);
    msgs.push(
      tip_received.to_msg({
        id: log.id,
        date: log.date,
        npo_name: npo.name,
        npo_id: +i.id,
        type_tip: log.type_tip!,
      })
    );
  }

  const cf_from_base = has_referrer ? pcfs.base * referral_commission_rate : 0;
  if (pcfs.base > 0) {
    const log: IRevenueLog = {
      id: crypto.randomUUID(),
      status: "final",
      date: i.sttl.date,
      donation_id: id,
      npo_id: +i.id,
      fund_id: null,
      npo_name: npo.name,
      type: "base-fee",
      gross: pcfs.base,
      commission: cf_from_base,
      revenue: pcfs.base - cf_from_base,
    };
    txs.push(log);
    await rev_log_put(db, log);
  }

  const cf_from_fsa = has_referrer ? pcfs.fsa * referral_commission_rate : 0;
  if (pcfs.fsa > 0) {
    const log: IRevenueLog = {
      id: crypto.randomUUID(),
      status: "final",
      date: i.sttl.date,
      donation_id: id,
      npo_id: +i.id,
      fund_id: null,
      npo_name: npo.name,
      type: "fsa-fee",
      gross: pcfs.fsa,
      commission: cf_from_fsa,
      revenue: pcfs.fsa - cf_from_fsa,
    };
    txs.push(log);
    await rev_log_put(db, log);
  }

  // rev_ltd derived via v_rev_ltd view — no explicit increment needed

  const cf_total = cf_from_tip + cf_from_base + cf_from_fsa;

  if (has_referrer && cf_total > 0) {
    dist.referrer = {
      id: referrer_id,
      cf_from_fee: cf_from_fsa + cf_from_base,
      cf_from_tip: cf_from_tip,
    };
    const c: ICommission = {
      date: date.toISOString(),
      referrer_user: npo.referrer_user ?? undefined,
      referrer_npo: npo.referrer_npo ?? undefined,
      donation_id: id,
      npo_id: npo.id,
      amount: cf_total,
      status: "pending",
    };

    txs.push(c);
    await commission_put(db, c);
  }

  const net_alloc: IAllocation = {
    cash: (dist.to_settings.alloc.cash / 100) * dist.net,
    liq: (dist.to_settings.alloc.liq / 100) * dist.net,
    lock: (dist.to_settings.alloc.lock / 100) * dist.net,
  };

  // update balances
  const incs: IBalanceDeltas = {
    liq: net_alloc.liq,
    lock: net_alloc.lock,
    lock_units: net_alloc.lock ? net_alloc.lock / i.nav_price : 0,
    cash: net_alloc.cash,
  };
  // logs and balance-txs
  if (net_alloc.lock || net_alloc.liq) {
    const lock_units = npo.lock_units ?? 0;
    const liq = npo.liq ?? 0;

    if (net_alloc.lock) {
      const purchased_units = net_alloc.lock / i.nav_price;

      // new investments are allocated to cash portion and rebalanced later
      // each log should have its own timestamp
      await nav_log_append(db, {
        reason: `npo:${don.to_id} donation allocation to lock`,
        date: new Date().toISOString(),
        cash_delta: net_alloc.lock,
        holder_deltas: [{ npo_id: +don.to_id, units_delta: purchased_units }],
      });

      const lock_tx: IBalanceTx = {
        id: crypto.randomUUID(),
        date_created: don.created_at,
        date_updated: don.created_at,
        npo_id: +don.to_id,
        account: "lock",
        bal_begin: lock_units,
        bal_end: lock_units + purchased_units,
        amount: net_alloc.lock,
        amount_units: purchased_units,
        status: "final",
        account_other_id: don.id,
        account_other: "donation",
        account_other_bal_begin: net_alloc.lock,
        account_other_bal_end: 0,
      };
      txs.push(lock_tx);
      await bal_tx_put(db, lock_tx);
      msgs.push(
        lock_tx_created.to_msg({
          npo_id: lock_tx.npo_id,
          account: lock_tx.account,
          account_other: lock_tx.account_other!,
          bal_begin: lock_tx.bal_begin,
          bal_end: lock_tx.bal_end,
          amount: lock_tx.amount,
          date_created: lock_tx.date_created,
        })
      );
    }

    if (net_alloc.liq) {
      const liq_tx: IBalanceTx = {
        id: crypto.randomUUID(),
        date_created: don.created_at,
        date_updated: don.created_at,
        npo_id: +don.to_id,
        account: "liq",
        bal_begin: liq,
        bal_end: liq + net_alloc.liq,
        amount: net_alloc.liq,
        amount_units: net_alloc.liq,
        status: "final",
        account_other_id: don.id,
        account_other: "donation",
        account_other_bal_begin: net_alloc.liq,
        account_other_bal_end: 0,
      };
      txs.push(liq_tx);
      await bal_tx_put(db, liq_tx);
    }
  }

  // create payout for cash allocation
  if (net_alloc.cash > 0) {
    const payout_id = crypto.randomUUID();
    const po: IPayout = {
      id: payout_id,
      source_id: don.id,
      npo_id: +don.to_id,
      source: "donation",
      date: don.created_at,
      amount: net_alloc.cash,
      type: "pending",
    };
    txs.push(po);
    await payout_put(db, po);
  }

  if (i.tx.from_public) {
    await donation_message_put(db, {
      id,
      donation_id: i.prnt.id,
      date: i.sttl.date,
      donor_message: i.tx.from_public_msg_to_npo ?? "",
      donor_name: i.tx.from_name || "Anonymous",
      npo_id: npo.id.toString(),
      amount: fa_added,
    });
  }

  // fund_contrib derived via v_donation_total_usd view — no explicit increment

  // increment form ltd
  if (i.source) {
    await form_ltd_inc(db, i.source.id, net, 1);
  }

  // increment program ltd
  if (i.program) {
    await npo_prog_contrib(db, i.program.id, net);
  }

  // increment npo balances
  await npo_balance_update(db, +i.id, incs, "inc");

  console.info(`settled npo ${i.id}, dist ${id}`);
  msgs.push(
    don_dist.to_msg({
      id: don.id,
      date_created: don.created_at,
      amount: don.amount.base,
      amount_usd: don.amount.base / don.upusd,
      amount_denom: don.currency,
      frequency: don.frequency,
      via: don.via,
      source: don.source,
      to_id: +don.to_id,
      to_name: don.to_name,
      net: dist.net,
      sttl_date: don.created_at,
      from_email: don.from_email,
      from: {
        name: don.from_name,
        company: don.from_company_name,
      },
      program: don.program,
      to_claimed: npo.claimed,
    })
  );
  return { msgs, txs };
}
