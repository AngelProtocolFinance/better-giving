import type { IBalanceTx } from "../balance-txs";
import { fees } from "../constants";
import { default_allocation } from "../constants/common";
import type {
  IDonation,
  IDonationDist,
  IToSettings,
  TToType,
} from "../donations";
import type { IAllocation } from "../npo";
import type { IPayout } from "../payouts";
import { msg } from "../queue";
import type { IMsg } from "../queue/types";
import type { ICommission } from "../referrals";
import type { IRevenueLog } from "../revenue";
import type { IBalanceDeltas, IDistFees } from "../types/donation";
import type { IInput, IParts } from "../types/donation-dist";

export const referral_commission_rate = 0.3;

export interface NpoSettlementContext {
  id: number;
  name: string;
  claimed: boolean;
  fiscal_sponsored: boolean;
  hide_bg_tip: boolean | null | undefined;
  allocation: IAllocation | null | undefined;
  lock_units: number | null | undefined;
  liq: number | null | undefined;
  referrer_user: string | null | undefined;
  referrer_npo: string | null | undefined;
  referrer_expiry: string | null | undefined;
}

export interface NavLogEntry {
  reason: string;
  date: string;
  cash_delta: number;
  holder_deltas: { npo_id: number; units_delta: number }[];
}

export interface SettlementPlan {
  dist: IDonationDist;
  don: IDonation;
  revenue_logs: IRevenueLog[];
  commission: ICommission | null;
  balance_txs: IBalanceTx[];
  payout: IPayout | null;
  nav_log_entry: NavLogEntry | null;
  balance_deltas: IBalanceDeltas;
  msgs: IMsg[];
}

// [resulting balance, excess fa]
const credit_fa = (
  amount: number,
  { fa, pf }: { fa: number; pf: number }
): [number, number] => [fa ? amount + pf : amount, fa ? fa - pf : 0];

// [net after fees, fee amounts]
const debit_pcfs = (amount: number, rates: IDistFees): [number, IDistFees] => {
  const base = amount * rates.base;
  const fsa = amount * rates.fsa;
  return [amount - base - fsa, { base, fsa }];
};

export const shared_parts = (obj: IParts, n: number): IParts => ({
  amnt: {
    base: obj.amnt.base / n,
    tip: obj.amnt.tip / n,
    fee_allowance: obj.amnt.fee_allowance / n,
  },
  amnt_usd: {
    base: obj.amnt_usd.base / n,
    tip: obj.amnt_usd.tip / n,
    fee_allowance: obj.amnt_usd.fee_allowance / n,
  },
  fa: {
    base: obj.fa.base / n,
    tip: obj.fa.tip / n,
    fee_allowance: obj.fa.fee_allowance / n,
  },
  sttl: {
    base: obj.sttl.base / n,
    tip: obj.sttl.tip / n,
    fee_allowance: obj.sttl.fee_allowance / n,
  },
  sttl_fee: {
    base: obj.sttl_fee.base / n,
    tip: obj.sttl_fee.tip / n,
    fee_allowance: obj.sttl_fee.fee_allowance / n,
  },
  sttl_fa: {
    base: obj.sttl_fa.base / n,
    tip: obj.sttl_fa.tip / n,
    fee_allowance: obj.sttl_fa.fee_allowance / n,
  },
});

export function calc_settlement_plan(
  i: IInput,
  ctx: NpoSettlementContext
): SettlementPlan {
  const [fa_added, fa_excess] = credit_fa(i.ps.sttl.base, {
    fa: i.ps.sttl_fa.base,
    pf: i.ps.sttl_fee.base,
  });

  // tip goes to BG (non-fsa, base fee not applicable) — no further deductions
  const [tip, tip_fa_excess] = credit_fa(i.ps.sttl.tip, {
    fa: i.ps.sttl_fa.tip,
    pf: i.ps.sttl_fee.tip,
  });

  const [net, pcfs] = debit_pcfs(fa_added, {
    base: ctx.hide_bg_tip ? fees.base : 0,
    fsa: ctx.fiscal_sponsored ? fees.fiscal_sponsor : 0,
  });

  const settings: IToSettings = {
    fiscal_sponsored: ctx.fiscal_sponsored,
    alloc: ctx.allocation ?? default_allocation,
  };

  const id = crypto.randomUUID();
  const date = new Date(i.sttl.date);

  const referrer_id = ctx.referrer_user ?? ctx.referrer_npo;
  const has_referrer =
    !!referrer_id &&
    !!ctx.referrer_expiry &&
    new Date(ctx.referrer_expiry) >= new Date();

  const cf_from_tip = has_referrer ? tip * referral_commission_rate : 0;
  const cf_from_base = has_referrer ? pcfs.base * referral_commission_rate : 0;
  const cf_from_fsa = has_referrer ? pcfs.fsa * referral_commission_rate : 0;
  const cf_total = cf_from_tip + cf_from_base + cf_from_fsa;

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
  if (has_referrer && cf_total > 0 && referrer_id) {
    dist.referrer = {
      id: referrer_id,
      cf_from_fee: cf_from_fsa + cf_from_base,
      cf_from_tip,
    };
  }

  const don: IDonation = {
    id,
    // tip is extracted from donation
    amount: { tip: 0, fee_allowance: i.ps.fa.base, base: i.ps.amnt.base },
    created_at: date.toISOString(),
    to_id: ctx.id.toString(),
    to_name: ctx.name,
    to_type: "npo" satisfies TToType,
    to_tip_allowed: ctx.hide_bg_tip ?? false,
    // settlement records has empty to_members
    to_members: [],
    dist,
    form_id: i.source?.id,
    program: i.program,
    ...i.tx,
  };

  const revenue_logs: IRevenueLog[] = [];
  const tip_log: IRevenueLog | null =
    tip > 0
      ? {
          id: crypto.randomUUID(),
          status: "final",
          date: i.sttl.date,
          donation_id: id,
          npo_id: ctx.id,
          fund_id: null,
          npo_name: ctx.name,
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
        }
      : null;
  if (tip_log) revenue_logs.push(tip_log);
  if (pcfs.base > 0) {
    revenue_logs.push({
      id: crypto.randomUUID(),
      status: "final",
      date: i.sttl.date,
      donation_id: id,
      npo_id: ctx.id,
      fund_id: null,
      npo_name: ctx.name,
      type: "base-fee",
      gross: pcfs.base,
      commission: cf_from_base,
      revenue: pcfs.base - cf_from_base,
    });
  }
  if (pcfs.fsa > 0) {
    revenue_logs.push({
      id: crypto.randomUUID(),
      status: "final",
      date: i.sttl.date,
      donation_id: id,
      npo_id: ctx.id,
      fund_id: null,
      npo_name: ctx.name,
      type: "fsa-fee",
      gross: pcfs.fsa,
      commission: cf_from_fsa,
      revenue: pcfs.fsa - cf_from_fsa,
    });
  }

  const commission: ICommission | null =
    has_referrer && cf_total > 0
      ? {
          date: date.toISOString(),
          referrer_user: ctx.referrer_user ?? undefined,
          referrer_npo: ctx.referrer_npo ?? undefined,
          donation_id: id,
          npo_id: ctx.id,
          amount: cf_total,
          status: "pending",
        }
      : null;

  const net_alloc: IAllocation = {
    cash: (settings.alloc.cash / 100) * net,
    liq: (settings.alloc.liq / 100) * net,
    lock: (settings.alloc.lock / 100) * net,
  };

  const balance_deltas: IBalanceDeltas = {
    liq: net_alloc.liq,
    lock: net_alloc.lock,
    lock_units: net_alloc.lock ? net_alloc.lock / i.nav_price : 0,
    cash: net_alloc.cash,
  };

  const balance_txs: IBalanceTx[] = [];
  const msgs: IMsg[] = [];

  if (tip_log) {
    msgs.push(
      msg("tip-received", {
        id: tip_log.id,
        date: tip_log.date,
        npo_name: ctx.name,
        npo_id: ctx.id,
        type_tip: tip_log.type_tip!,
      })
    );
  }

  let nav_log_entry: NavLogEntry | null = null;

  if (net_alloc.lock || net_alloc.liq) {
    const lock_units = ctx.lock_units ?? 0;
    const liq = ctx.liq ?? 0;

    if (net_alloc.lock) {
      const purchased_units = net_alloc.lock / i.nav_price;

      // new investments are allocated to cash portion and rebalanced later.
      // load-bearing: distinct per call so batch settlements get distinct ordering timestamps
      nav_log_entry = {
        reason: `npo:${don.to_id} donation allocation to lock`,
        date: new Date().toISOString(),
        cash_delta: net_alloc.lock,
        holder_deltas: [{ npo_id: ctx.id, units_delta: purchased_units }],
      };

      const lock_tx: IBalanceTx = {
        id: crypto.randomUUID(),
        date_created: don.created_at,
        date_updated: don.created_at,
        npo_id: ctx.id,
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
      balance_txs.push(lock_tx);
      msgs.push(
        msg("lock-tx-created", {
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
      balance_txs.push({
        id: crypto.randomUUID(),
        date_created: don.created_at,
        date_updated: don.created_at,
        npo_id: ctx.id,
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
      });
    }
  }

  const payout: IPayout | null =
    net_alloc.cash > 0
      ? {
          id: crypto.randomUUID(),
          source_id: don.id,
          npo_id: ctx.id,
          source: "donation",
          date: don.created_at,
          amount: net_alloc.cash,
          type: "pending",
        }
      : null;

  msgs.push(
    msg("don-dist", {
      id: don.id,
      date_created: don.created_at,
      amount: don.amount.base,
      amount_usd: don.amount.base / don.upusd,
      amount_denom: don.currency,
      frequency: don.frequency,
      via: don.via,
      source: don.source,
      to_id: ctx.id,
      to_name: ctx.name,
      net: dist.net,
      sttl_date: don.created_at,
      from_email: don.from_email,
      from: {
        name: don.from_name,
        company: don.from_company_name,
      },
      program: don.program,
      to_claimed: ctx.claimed,
    })
  );

  return {
    dist,
    don,
    revenue_logs,
    commission,
    balance_txs,
    payout,
    nav_log_entry,
    balance_deltas,
    msgs,
  };
}
