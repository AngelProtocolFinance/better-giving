import type { IBalanceTx } from "@/balance-txs";
import { humanize } from "@/helpers/decimal";
import type { ILossLog, LossType } from "@/revenue";
import type { IBalanceDeltas } from "@/types/donation";

export interface PreviewLine {
  label: string;
  pass: boolean;
  reason?: string;
}

export interface RefundDistInput {
  id: string;
  donation_id: string;
  to_id: number;
  to_name: string;
  alloc: { liq?: number; lock?: number; cash?: number };
  net: number;
  amount: number;
  /** null on legacy rows that predate it */
  amount_usd: number | null;
  fee_base: number;
  fee_fsa: number;
  fee_processing: number;
  /** 0 or absent when the donor didn't cover fees */
  fee_allowance?: number;
}

export interface RefundInputs {
  dist: RefundDistInput;
  payout: { id: string; type: string | null } | null;
  commission: { donation_id: string; amount: number; status: string } | null;
  rev_log_ids: string[];
  bal: { liq: number; lock_units: number; cash: number };
  nav: { price: number } | null;
  sub_id: string | null;
}

export interface RefundCtx {
  now: string;
  /**
   * separate from `now` because `nav_logs.date` is that table's primary key,
   * and a fund refund plans one distribution at a time — two of them reaching
   * `new Date()` inside the same millisecond would collide. the caller mints
   * this through `nav_log_date`; everything else here can share `now`.
   */
  nav_date: string;
  form_id: string | null;
  program_id: string | null;
}

export interface NavLogAppend {
  reason: string;
  date: string;
  cash_delta: number;
  holder_deltas: { npo_id: number; units_delta: number }[];
}

// effects are emitted in execution order; walker dispatches one PG call per effect.
export type RefundEffect =
  | { kind: "balance_update"; npo_id: number; deltas: IBalanceDeltas }
  | { kind: "bal_tx_put"; tx: IBalanceTx }
  | { kind: "nav_log"; entry: NavLogAppend }
  | {
      kind: "payout_status";
      payout_id: string;
      status: "refunded" | "refunded_loss";
    }
  | {
      kind: "rev_log_status";
      rev_log_id: string;
      status: "refunded" | "refunded_loss";
    }
  | {
      kind: "commission_status";
      donation_id: string;
      status: "refunded" | "refunded_loss";
    }
  | { kind: "form_decrement"; form_id: string; net: number }
  | { kind: "program_decrement"; program_id: string; net: number }
  | { kind: "donation_message_del"; donation_id: string }
  | { kind: "loss_log"; loss: ILossLog };

export interface RefundPreview {
  effects: PreviewLine[];
  blockers: PreviewLine[];
  warnings: PreviewLine[];
}

export interface RefundPlan {
  is_loss: boolean;
  loss_reasons: string[];
  /** the loss in usd, like every loss figure — `dist.amount` is in the donation's
   * currency. the dist's settled gross less the cash share a cancelled payout recovers */
  amount: number;
  /** a commission its referrer was already paid: left `paid`, the platform's loss */
  paid_commission: { donation_id: string; amount: number } | null;
  effects: RefundEffect[];
  preview: RefundPreview;
}

/** a dist's gross in settled usd. a fee allowance credits the processing fee
 * into `net` (`credit_fa` in `lib/settlement/plan.ts`), so it is counted once */
export const dist_settled_usd = (
  d: Pick<
    RefundDistInput,
    "net" | "fee_base" | "fee_fsa" | "fee_processing" | "fee_allowance"
  >
): number =>
  d.net + d.fee_base + d.fee_fsa + (d.fee_allowance ? 0 : d.fee_processing);

/** what is wrong with a loss's figures, or null. the loss covers the npo's
 * share plus fees, so it is never under `npo_amount`, and neither goes negative */
export const loss_figures_off = (
  l: Pick<ILossLog, "amount" | "npo_amount">
): string | null =>
  l.npo_amount < 0 || l.amount < l.npo_amount
    ? `loss figures off: amount ${l.amount}, npo_amount ${l.npo_amount}`
    : null;

export function calc_refund_plan(
  inputs: RefundInputs,
  ctx: RefundCtx
): RefundPlan {
  const { dist, payout, commission, rev_log_ids, bal, nav, sub_id } = inputs;
  const { now, nav_date, form_id, program_id } = ctx;

  // reverse what settlement credited: a share missing from the stored jsonb credited 0
  const alloc = {
    liq: dist.alloc.liq ?? 0,
    lock: dist.alloc.lock ?? 0,
    cash: dist.alloc.cash ?? 0,
  };
  // derive balance deltas from allocation percentages
  const bd = {
    liq: (alloc.liq / 100) * dist.net,
    lock: (alloc.lock / 100) * dist.net,
    cash: (alloc.cash / 100) * dist.net,
  };
  const refund_lock_units = nav && bd.lock > 0 ? bd.lock / nav.price : 0;

  const preview: RefundPreview = {
    effects: [],
    blockers: [],
    warnings: [],
  };
  const loss_reasons: string[] = [];

  // liq check
  if (bd.liq > 0) {
    if (bal.liq >= bd.liq) {
      preview.effects.push({
        label: "Savings balance",
        pass: true,
        reason: `$${humanize(bd.liq)} will be deducted`,
      });
    } else {
      preview.warnings.push({
        label: "Savings balance",
        pass: false,
        reason: `has $${humanize(bal.liq)}, need $${humanize(bd.liq)}`,
      });
      loss_reasons.push(`liq: has $${bal.liq}, need $${bd.liq}`);
    }
  }

  // lock check
  if (bd.lock > 0) {
    if (bal.lock_units >= refund_lock_units) {
      preview.effects.push({
        label: "Investment balance",
        pass: true,
        reason: `$${humanize(bd.lock)} will be redeemed`,
      });
    } else {
      preview.warnings.push({
        label: "Investment balance",
        pass: false,
        reason: `has ${humanize(bal.lock_units)}u, need ${humanize(refund_lock_units)}u`,
      });
      loss_reasons.push(
        `lock: has ${bal.lock_units}u, need ${refund_lock_units}u`
      );
    }
  }

  // cash/payout check
  if (bd.cash > 0 && payout) {
    if (payout.type === "pending") {
      preview.effects.push({
        label: "Grant payout",
        pass: true,
        reason: `$${humanize(bd.cash)} pending payout will be cancelled`,
      });
    } else {
      preview.warnings.push({
        label: "Grant payout",
        pass: false,
        reason: `$${humanize(bd.cash)} payout is ${payout.type ?? "missing"}, cannot reverse`,
      });
      loss_reasons.push(`payout ${payout.id} is ${payout.type ?? "missing"}`);
    }
  }

  // commission (preview only; status follows is_loss below, and apply re-reads
  // it under lock: a processing one goes refunded_loss, a paid one stays paid)
  if (commission?.status === "paid") {
    preview.warnings.push({
      label: "Commission",
      pass: false,
      reason: `$${humanize(commission.amount)} was already paid to its referrer, so it stays with them as the platform's loss (ops is alerted)`,
    });
  } else if (commission?.status === "processing") {
    preview.warnings.push({
      label: "Commission",
      pass: false,
      reason: `$${humanize(commission.amount)} is in a payout to its referrer, so it will be reversed as a loss`,
    });
  } else if (commission) {
    preview.effects.push({
      label: "Commission",
      pass: true,
      reason: `$${humanize(commission.amount)} will be reversed`,
    });
  }

  if (sub_id) {
    preview.effects.push({
      label: "Subscription",
      pass: true,
      reason: "will be cancelled",
    });
  }

  if (
    preview.effects.length === 0 &&
    preview.warnings.length === 0 &&
    preview.blockers.length === 0
  ) {
    preview.effects.push({ label: "No balance changes", pass: true });
  }

  const is_loss = loss_reasons.length > 0;
  const status: "refunded" | "refunded_loss" = is_loss
    ? "refunded_loss"
    : "refunded";

  // a pending payout hasn't paid out its cash, so it is cancelled and its cash
  // reversed even when a savings/investment shortfall makes the refund a loss
  const payout_cancelled = payout?.type === "pending";
  const cash_recovered = payout_cancelled ? bd.cash : 0;
  const loss_usd = dist_settled_usd(dist) - cash_recovered;

  const effects: RefundEffect[] = [];

  // payout row before the npos row: the grants cron's settle writes payouts
  // then the npos row, so the reverse order deadlocks it
  if (payout) {
    effects.push({
      kind: "payout_status",
      payout_id: payout.id,
      status: payout_cancelled ? "refunded" : status,
    });
  }

  if (is_loss && cash_recovered > 0) {
    effects.push({
      kind: "balance_update",
      npo_id: dist.to_id,
      deltas: { liq: 0, lock: 0, lock_units: 0, cash: cash_recovered },
    });
  }

  // balance/NAV writes — only when fully reversible
  if (!is_loss) {
    const refund_deltas: IBalanceDeltas = {
      liq: bd.liq,
      lock: bd.lock,
      lock_units: refund_lock_units,
      cash: bd.cash,
    };
    effects.push({
      kind: "balance_update",
      npo_id: dist.to_id,
      deltas: refund_deltas,
    });

    if (bd.liq > 0) {
      effects.push({
        kind: "bal_tx_put",
        tx: {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: dist.to_id,
          account: "liq",
          bal_begin: bal.liq,
          bal_end: bal.liq - bd.liq,
          amount: bd.liq,
          amount_units: bd.liq,
          status: "final",
          account_other_id: dist.id,
          account_other: "refund",
          account_other_bal_begin: 0,
          account_other_bal_end: bd.liq,
        },
      });
    }

    if (bd.lock > 0 && nav) {
      const lock_usd = refund_lock_units * nav.price;
      effects.push({
        kind: "bal_tx_put",
        tx: {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: dist.to_id,
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
        },
      });
    }

    if (bd.lock > 0 && nav) {
      effects.push({
        kind: "nav_log",
        entry: {
          reason: `refund npo:${dist.to_id}`,
          date: nav_date,
          cash_delta: -bd.lock,
          holder_deltas: [
            { npo_id: dist.to_id, units_delta: -refund_lock_units },
          ],
        },
      });
    }
  }

  // always-reversed: revenue logs
  for (const id of rev_log_ids) {
    effects.push({ kind: "rev_log_status", rev_log_id: id, status });
  }

  // reversed unless the referrer was already paid: that money stays with them
  // as the platform's loss, carried on `paid_commission` rather than logged —
  // loss_logs is per npo, and the npo's side still reverses in full
  const paid_commission =
    commission?.status === "paid"
      ? { donation_id: commission.donation_id, amount: commission.amount }
      : null;
  if (commission && !paid_commission) {
    effects.push({
      kind: "commission_status",
      donation_id: commission.donation_id,
      status,
    });
  }

  // form / program contributions (always decrement)
  if (form_id) {
    effects.push({ kind: "form_decrement", form_id, net: dist.net });
  }
  if (program_id) {
    effects.push({ kind: "program_decrement", program_id, net: dist.net });
  }

  // donation thank-you message
  effects.push({
    kind: "donation_message_del",
    donation_id: dist.donation_id,
  });

  if (is_loss) {
    const loss_type: LossType = loss_reasons[0].startsWith("liq")
      ? "balance_liq"
      : loss_reasons[0].startsWith("lock")
        ? "balance_lock"
        : "payout";
    const loss: ILossLog = {
      id: crypto.randomUUID(),
      date: now,
      donation_id: dist.donation_id,
      dist_id: dist.id,
      npo_id: dist.to_id,
      type: loss_type,
      amount: loss_usd,
      npo_amount: dist.net - cash_recovered,
      fees_bg: dist.fee_base + dist.fee_fsa,
      fees_processing: dist.fee_processing,
      reason: loss_reasons.join("; "),
    };
    effects.push({ kind: "loss_log", loss });
  }

  return {
    is_loss,
    loss_reasons,
    amount: loss_usd,
    paid_commission,
    effects,
    preview,
  };
}
