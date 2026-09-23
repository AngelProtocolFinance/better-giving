import {
  calc_donation_settle,
  type IDonation,
  type IDonationUpdate,
  settle_msgs,
} from "@/donations";
import type { NP } from "@/nowpayments/types";
import { nowpayments } from "$/env";
import { np } from "$/kit/nowpayments";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import {
  donation_by_sttl_id,
  donation_settle_state_locked,
  donation_update,
  type SettleState,
  settle_state_of,
} from "$/pg/queries/donation";
import { alert_all } from "../alert";
import { paid_amount, to_settlement } from "../payment";
import { settle_rates } from "../rates";
import { transition } from "../status";

export type SettleOutcome =
  | { op: "settled"; id: string; late: boolean }
  /** this payment already settled the row; its messages were queued again */
  | { op: "duplicate"; id: string }
  /** the row is closed under another outcome; nothing written */
  | { op: "refused"; id: string }
  /** nothing written, nothing to raise */
  | { op: "ignored"; id: string; why: string };

const ORDER = { repeat: false };

type Blocked = Exclude<SettleOutcome, { op: "settled" }>;

/** the outcome a row in `state` forces on this payment, or the settle it allows */
const settle_blocked = (
  id: string,
  state: SettleState,
  payment: NP.PaymentPayload
): Blocked | { op: "settle"; late: boolean } => {
  const action = transition(state, payment, ORDER);
  switch (action.op) {
    case "settle":
      return action;
    case "duplicate":
      return { op: "duplicate", id };
    case "refuse":
      return { op: "refused", id };
    case "ignore":
      return { op: "ignored", id, why: action.why };
    default:
      throw new Error(`unexpected ${action.op} on a nowpayments settle`);
  }
};

/**
 * the enqueue sits after the commit, so a delivery can leave a settled row
 * whose messages never went out, or only some of them; the delivery that finds
 * the row settled re-sends them all. a duplicate is absorbed per destination
 * by unique(donation_id, to_id) — a fund's split is recomputed on each run, so
 * a member activated in between gets a share the first run didn't count — the
 * match event by its unique donation_id, the receipt by its send claim.
 *
 * `row` was read `settled`: `transition` answers `duplicate` on no other
 * status. a refund can still commit between that read and the enqueue, so the
 * consumers re-check the row — `settle_npo` and `claim_receipt_send` skip a
 * reversed donation.
 */
const requeue = async (row: IDonation | undefined) => {
  if (!row?.settlement)
    throw new Error("duplicate settle without a settlement");
  await enqueue(
    ...settle_msgs({ ...row, settlement: row.settlement }, { match: true })
  );
};

export const handle_settled = async (
  payment: NP.PaymentPayload,
  prior: IDonation
): Promise<SettleOutcome> => {
  // spares a redelivery the rate lookups; rechecked under the row lock below
  const early = settle_blocked(prior.id, settle_state_of(prior), payment);
  if (early.op === "duplicate") await requeue(prior);
  if (early.op !== "settle") return early;

  const rates = await settle_rates(payment);
  const sttl = to_settlement(payment, rates, new Date().toISOString());
  await alert_all(sttl.warnings);

  // an underpayment is accepted as a donation of what arrived
  const paid: IDonationUpdate =
    payment.payment_status === "partially_paid"
      ? {
          amount: paid_amount(payment, prior, nowpayments.is_sandbox),
          currency: prior.currency,
          upusd: 1 / (await np.estimate(payment.pay_currency)).usdpu,
        }
      : {};

  const result = calc_donation_settle({
    kind: "one-time",
    order_id: prior.id,
    prior: { ...prior, ...paid },
    settlement: sttl.value,
  });
  if (result.op !== "update") {
    throw new Error(`unexpected ${result.op} for nowpayments one-time`);
  }

  // the settlement upsert's arbiter is donation_id, so a concurrent delivery of
  // this payment updates the same row in place — the sttl_id unique index never
  // fires here, and only the lock serializes the two
  const locked = await db.transaction(async (tx) => {
    const state = await donation_settle_state_locked(tx, result.order_id);
    if (!state) throw new Error(`donation ${result.order_id} not found`);
    const now = settle_blocked(result.order_id, state, payment);
    if (now.op === "duplicate") {
      const row = await donation_by_sttl_id(payment.payment_id.toString(), tx);
      return { now, row };
    }
    if (now.op === "settle") {
      await donation_update(tx, result.order_id, { ...paid, ...result.patch });
    }
    return { now, row: undefined };
  });

  if (locked.now.op === "duplicate") await requeue(locked.row);
  if (locked.now.op !== "settle") return locked.now;

  await enqueue(...result.msgs);
  return { op: "settled", id: result.order_id, late: locked.now.late };
};
