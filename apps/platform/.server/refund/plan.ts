import type { IBalanceTx } from "@/balance-txs";
import { humanize } from "@/helpers/decimal";
import type { IBalanceDeltas } from "@/types/donation";
import type { IOwedRecord, OwedParty } from "../pg/queries/owed";

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

export type ReferrerParty = Exclude<OwedParty, { npo_id: number }>;

/** the party a commission row names: exactly one is set, by its check */
export const referrer_of = (c: {
  referrer_user?: string | null;
  referrer_npo?: string | null;
}): ReferrerParty =>
  c.referrer_user != null
    ? { referrer_user: c.referrer_user }
    : { referrer_npo: c.referrer_npo! };

export interface RefundInputs {
  dist: RefundDistInput;
  payout: { id: string; type: string | null } | null;
  /** keyed by the dist's id; `amount` in usd */
  commission: {
    donation_id: string;
    amount: number;
    status: string;
    referrer: ReferrerParty;
  } | null;
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
      /** its referrer's share, recorded once apply finds the commission paid,
       * or claimed by a transfer that may pay it, with what the gift's other
       * reversed dists left that referrer owing */
      owed: OwedFigure & { party: ReferrerParty };
    }
  | { kind: "form_decrement"; form_id: string; net: number }
  | { kind: "program_decrement"; program_id: string; net: number }
  | { kind: "donation_message_del"; donation_id: string }
  | { kind: "owed"; owed: OwedFigure };

/** what a party owes back on the dist; the refund or dispute behind it is the caller's */
export type OwedFigure = Omit<IOwedRecord, "source" | "source_ref">;

export interface RefundPreview {
  effects: PreviewLine[];
  blockers: PreviewLine[];
  warnings: PreviewLine[];
}

export interface RefundPlan {
  is_loss: boolean;
  loss_reasons: string[];
  /** what each party owes in usd, as the plan sees it. the npo's — on the loss
   * path — is its settled net less the cash share a cancelled payout recovers,
   * plus the processing fee; bg's own fees are forgone, not owed. the
   * referrer's is a commission paid or claimed for a transfer, which apply
   * re-reads under its lock */
  amount: { party: OwedParty; usd: number }[];
  effects: RefundEffect[];
  preview: RefundPreview;
}

/** the processing fee a dist cost beyond its `net`, in usd. a fee allowance
 * credits it into `net` (`credit_fa` in `lib/settlement/plan.ts`), so it is 0 then */
export const fee_processing_usd = (
  d: Pick<RefundDistInput, "fee_processing" | "fee_allowance">
): number => (d.fee_allowance ? 0 : d.fee_processing);

/** a dist's gross in settled usd, counting the processing fee once */
export const dist_settled_usd = (
  d: Pick<
    RefundDistInput,
    "net" | "fee_base" | "fee_fsa" | "fee_processing" | "fee_allowance"
  >
): number => d.net + d.fee_base + d.fee_fsa + fee_processing_usd(d);

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

  // commission (preview only; apply re-reads it under lock)
  if (commission?.status === "paid") {
    preview.warnings.push({
      label: "Commission",
      pass: false,
      reason: `$${humanize(commission.amount)} was already paid to its referrer, so it will be recovered from the referrer's next commission`,
    });
  } else if (commission?.status === "processing") {
    preview.warnings.push({
      label: "Commission",
      pass: false,
      reason: `$${humanize(commission.amount)} is in a payout to its referrer: if that payout goes through, it will be recovered from the referrer's next commission`,
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
  const owed: OwedFigure = {
    donation_id: dist.donation_id,
    party: { npo_id: dist.to_id },
    received_usd: dist.net - cash_recovered,
    fee_processing_usd: fee_processing_usd(dist),
    now,
  };

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

  // its referrer owes it if apply finds it paid (left paid) or claimed by a
  // transfer, under its lock; the npo never owes it
  if (commission) {
    effects.push({
      kind: "commission_status",
      donation_id: commission.donation_id,
      status,
      owed: {
        donation_id: dist.donation_id,
        party: commission.referrer,
        received_usd: commission.amount,
        fee_processing_usd: 0,
        now,
      },
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

  if (is_loss) effects.push({ kind: "owed", owed });

  const amount: RefundPlan["amount"] = [];
  if (is_loss) {
    const usd = owed.received_usd + owed.fee_processing_usd;
    amount.push({ party: owed.party, usd });
  }
  if (commission?.status === "paid" || commission?.status === "processing") {
    amount.push({ party: commission.referrer, usd: commission.amount });
  }

  return { is_loss, loss_reasons, amount, effects, preview };
}
