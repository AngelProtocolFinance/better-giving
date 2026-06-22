import { calc_settlement_plan } from "@/settlement/plan";
import type { IInput } from "@/types/donation-dist";
import { npo_get } from "$/pg/queries/npo";

// same computation as settle_npo, no db writes
export async function preview_settlement(i: IInput) {
  const npo = await npo_get(+i.id);
  if (!npo) return null;

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

  const { dist, revenue_logs, commission, balance_txs, payout } = plan;

  const txs: unknown[] = [];
  txs.push({
    _record: "distribution",
    gross: dist.gross,
    net: dist.net,
    currency: dist.currency,
    fees: dist.fees,
    fee_allowance: dist.fee_allowance,
    fee_allowance_excess: dist.fee_allowance_excess,
  });
  for (const r of revenue_logs)
    txs.push({
      _record: "revenue_log",
      status: "final" as const,
      type: r.type,
      gross: r.gross,
      commission: r.commission,
      revenue: r.revenue,
    });
  if (commission)
    txs.push({
      _record: "commission",
      referrer_user: commission.referrer_user,
      referrer_npo: commission.referrer_npo,
      amount: commission.amount,
      status: commission.status,
    });
  for (const tx of balance_txs)
    txs.push({
      _record: "balance_tx",
      status: "final" as const,
      account: tx.account,
      account_other: "donation" as const,
      bal_begin: tx.bal_begin,
      bal_end: tx.bal_end,
      amount: tx.amount,
      amount_units: tx.amount_units,
    });
  if (payout)
    txs.push({
      _record: "payout",
      amount: payout.amount,
      type: "pending" as const,
      source: "donation" as const,
    });

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
