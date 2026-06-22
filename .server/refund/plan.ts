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
  alloc: { liq: number; lock: number; cash: number };
  net: number;
  amount: number;
  fee_base: number;
  fee_fsa: number;
  fee_processing: number;
}

export interface RefundInputs {
  dist: RefundDistInput;
  payout: { id: string; type: string | null } | null;
  commission: { donation_id: string; amount: number } | null;
  rev_log_ids: string[];
  bal: { liq: number; lock_units: number; cash: number };
  nav: { price: number } | null;
  sub_id: string | null;
}

export interface RefundCtx {
  now: string;
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
  amount: number;
  effects: RefundEffect[];
  preview: RefundPreview;
}

export function calc_refund_plan(
  inputs: RefundInputs,
  ctx: RefundCtx
): RefundPlan {
  const { dist, payout, commission, rev_log_ids, bal, nav, sub_id } = inputs;
  const { now, form_id, program_id } = ctx;

  // derive balance deltas from allocation percentages
  const bd = {
    liq: (dist.alloc.liq / 100) * dist.net,
    lock: (dist.alloc.lock / 100) * dist.net,
    cash: (dist.alloc.cash / 100) * dist.net,
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

  // commission — always reversed (preview only; status follows is_loss below)
  if (commission) {
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

  const effects: RefundEffect[] = [];

  // balance/payout/NAV writes — only when fully reversible
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

    if (payout) {
      effects.push({
        kind: "payout_status",
        payout_id: payout.id,
        status: "refunded",
      });
    }

    if (bd.lock > 0 && nav) {
      effects.push({
        kind: "nav_log",
        entry: {
          reason: `refund npo:${dist.to_id}`,
          date: now,
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

  // always-reversed: commission
  if (commission) {
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

  // loss path: mark payout as refunded_loss and log loss
  if (is_loss) {
    if (payout) {
      effects.push({
        kind: "payout_status",
        payout_id: payout.id,
        status: "refunded_loss",
      });
    }
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
      amount: dist.amount,
      npo_amount: dist.net,
      fees_bg: dist.fee_base + dist.fee_fsa,
      fees_processing: dist.fee_processing,
      reason: loss_reasons.join("; "),
    };
    effects.push({ kind: "loss_log", loss });
  }

  return {
    is_loss,
    loss_reasons,
    amount: dist.amount,
    effects,
    preview,
  };
}
