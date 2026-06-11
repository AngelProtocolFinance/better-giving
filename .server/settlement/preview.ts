import type { IBalanceTx } from "@/balance-txs";
import { fees } from "@/constants";
import { default_allocation } from "@/constants/common";
import type { IAllocation } from "@/npo";
import type { IPayout } from "@/payouts";
import type { ICommission } from "@/referrals";
import type { IRevenueLog } from "@/revenue";
import type { IInput } from "@/types/donation-dist";
import { npo_get } from "$/pg/queries/npo";
import { referral_commission_rate } from "./config";
import { credit_fa, debit_pcfs } from "./helpers";

// same computation as settle_npo, no db writes
export async function preview_settlement(i: IInput) {
  const npo = await npo_get(+i.id);
  if (!npo) return null;

  const [fa_added, fa_excess] = credit_fa(i.ps.sttl.base, {
    fa: i.ps.sttl_fa.base,
    pf: i.ps.sttl_fee.base,
  });

  const [tip] = credit_fa(i.ps.sttl.tip, {
    fa: i.ps.sttl_fa.tip,
    pf: i.ps.sttl_fee.tip,
  });

  const [net, pcfs] = debit_pcfs(fa_added, {
    base: npo.hide_bg_tip ? fees.base : 0,
    fsa: npo.fiscal_sponsored ? fees.fiscal_sponsor : 0,
  });

  const alloc = npo.allocation ?? default_allocation;
  const net_alloc: IAllocation = {
    cash: (alloc.cash / 100) * net,
    liq: (alloc.liq / 100) * net,
    lock: (alloc.lock / 100) * net,
  };

  // distribution
  const dist = {
    gross: i.ps.sttl.base,
    net,
    currency: i.sttl.currency,
    fees: { base: pcfs.base, fsa: pcfs.fsa, processing: i.ps.sttl_fee.base },
    fee_allowance: i.ps.sttl_fa.base,
    fee_allowance_excess: fa_excess,
  };

  // revenue logs
  const rev_logs: Pick<
    IRevenueLog,
    "type" | "gross" | "commission" | "revenue"
  >[] = [];

  const referrer_id = npo.referrer_user ?? npo.referrer_npo;
  const has_referrer =
    referrer_id &&
    npo.referrer_expiry &&
    new Date(npo.referrer_expiry) >= new Date();

  const cf_from_tip = has_referrer ? tip * referral_commission_rate : 0;
  if (tip > 0) {
    rev_logs.push({
      type: "tip",
      gross: tip,
      commission: cf_from_tip,
      revenue: tip - cf_from_tip,
    });
  }

  const cf_from_base = has_referrer ? pcfs.base * referral_commission_rate : 0;
  if (pcfs.base > 0) {
    rev_logs.push({
      type: "base-fee",
      gross: pcfs.base,
      commission: cf_from_base,
      revenue: pcfs.base - cf_from_base,
    });
  }

  const cf_from_fsa = has_referrer ? pcfs.fsa * referral_commission_rate : 0;
  if (pcfs.fsa > 0) {
    rev_logs.push({
      type: "fsa-fee",
      gross: pcfs.fsa,
      commission: cf_from_fsa,
      revenue: pcfs.fsa - cf_from_fsa,
    });
  }

  // commission
  const cf_total = cf_from_tip + cf_from_base + cf_from_fsa;
  let commission: Pick<
    ICommission,
    "referrer_user" | "referrer_npo" | "amount" | "status"
  > | null = null;
  if (has_referrer && cf_total > 0) {
    commission = {
      referrer_user: npo.referrer_user ?? undefined,
      referrer_npo: npo.referrer_npo ?? undefined,
      amount: cf_total,
      status: "pending",
    };
  }

  // balance transactions
  const bal_txs: Pick<
    IBalanceTx,
    "account" | "bal_begin" | "bal_end" | "amount" | "amount_units"
  >[] = [];

  if (net_alloc.lock || net_alloc.liq) {
    const lock_units = npo.lock_units ?? 0;
    const liq = npo.liq ?? 0;

    if (net_alloc.lock) {
      const purchased_units = net_alloc.lock / i.nav_price;
      bal_txs.push({
        account: "lock",
        bal_begin: lock_units,
        bal_end: lock_units + purchased_units,
        amount: net_alloc.lock,
        amount_units: purchased_units,
      });
    }

    if (net_alloc.liq) {
      bal_txs.push({
        account: "liq",
        bal_begin: liq,
        bal_end: liq + net_alloc.liq,
        amount: net_alloc.liq,
        amount_units: net_alloc.liq,
      });
    }
  }

  // payout
  let payout: Pick<IPayout, "amount" | "type" | "source"> | null = null;
  if (net_alloc.cash > 0) {
    payout = { amount: net_alloc.cash, type: "pending", source: "donation" };
  }

  // txs: mirrors the unknown[] accumulator in settle_npo
  const txs: unknown[] = [];
  txs.push({ _record: "distribution", ...dist });
  for (const r of rev_logs)
    txs.push({ _record: "revenue_log", status: "final", ...r });
  if (commission) txs.push({ _record: "commission", ...commission });
  for (const tx of bal_txs)
    txs.push({
      _record: "balance_tx",
      status: "final",
      account_other: "donation",
      ...tx,
    });
  if (payout) txs.push({ _record: "payout", ...payout });

  return {
    npo_name: npo.name,
    fiscal_sponsored: npo.fiscal_sponsored,
    nav_price: i.nav_price,
    txs,
  };
}

export type ISettlementPreview = NonNullable<
  Awaited<ReturnType<typeof preview_settlement>>
>;
