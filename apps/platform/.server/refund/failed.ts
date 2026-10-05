import { and, eq } from "drizzle-orm";
import { type IDonation, is_reversed } from "@/donations";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import { donation_lock } from "../pg/queries/donation";
import type { DbOrTx } from "../pg/queries/helpers";
import { type OwedParty, owed_for_party, owed_total } from "../pg/queries/owed";
import {
  refund_failed_ref,
  refunds_credited_back,
} from "../pg/queries/owed-refund";
import { donations } from "../pg/schema/donation";
import { loss_logs } from "../pg/schema/revenue";
import { fee_processing_usd, referrer_of } from "./plan";
import { load_reversible, type Rail, type Unreversible } from "./reverse";
import {
  credit_parts,
  gift_dists_locked,
  grant_went_out,
  type LockedDist,
  scaled,
} from "./share";

export interface RefundFailed {
  donation_id: string;
  rail: Rail;
  /** the refund that failed: its provider id, what each credit answers to,
   * and its amount, in the charge's unit like `of` and `others` */
  refund: { id: string; amount: number };
  /** what the charge took */
  of: number;
  /** what the charge's other refunds, not failed or canceled, take back */
  others: number;
}

export type RefundFailedResult =
  /** each party's part of what the refund recorded is credited back.
   * `credited`: one line per party's row. `donation_status`: the gift as it
   * stays; a reversed one is not re-settled */
  | {
      status: "credited";
      donation_status: IDonation["status"];
      credited: string[];
    }
  /** as `credited`, but some dist's reversal or partial refund took nothing
   * on record to credit: its money came out of the npo's balances or pending
   * payout, or ops adjusted it by hand. `by_hand`: one line per such dist,
   * for ops to undo */
  | {
      status: "by_hand";
      donation_status: IDonation["status"];
      credited: string[];
      by_hand: string[];
    }
  /** the gift has none of the refund on record (it failed before an event
   * recorded it, or a run before this one credited it back): nothing written */
  | { status: "not_recorded"; donation_status: IDonation["status"] }
  | Extract<Unreversible, { status: "failed" }>;

/**
 * a refund that failed after it succeeded: the donor got nothing back, so
 * what each party was recorded as owing for it is credited back, by the
 * refund's share of the charge. what was already recovered of it becomes due
 * back. its share is what the gift has on record as taken back beyond what
 * the charge's other refunds still take: all of it once reversed, else the
 * share its partials recorded, which drops by it.
 *
 * safe to rerun: a redelivery credits nothing more.
 */
export async function refund_failed(
  r: RefundFailed
): Promise<RefundFailedResult> {
  const loaded = await load_reversible(r.donation_id, r.rail);
  if (loaded.status === "failed") return loaded;
  const { don } = loaded;
  const { refund, of } = r;
  if (!(of > 0 && refund.amount > 0 && r.others >= 0)) {
    throw new Error(`refund ${refund.id}: amounts don't size the charge`);
  }
  const now = new Date().toISOString();

  return db.transaction(async (tx): Promise<RefundFailedResult> => {
    const ds = await gift_dists_locked(tx, don.id);
    // read under its lock: a concurrent failure of another refund on the
    // charge lowers the share this one is sized off
    await donation_lock(tx, don.id);
    const [cur] = await tx
      .select({ status: donations.status, share: donations.refunded_share })
      .from(donations)
      .where(eq(donations.id, don.id));
    // the column is text; its check holds it to the statuses
    const donation_status = (cur?.status ?? don.status) as IDonation["status"];
    // credited back by an earlier run: a redelivery sized now would take the
    // share of another refund that failed since
    const done = await refunds_credited_back(tx, don.id, [refund.id]);
    if (done.size > 0) return { status: "not_recorded", donation_status };
    const reversed = is_reversed(donation_status);
    const recorded = reversed ? of : (cur?.share ?? 0) * of;
    const taken = Math.min(refund.amount, recorded - r.others);
    if (taken <= 1e-9) return { status: "not_recorded", donation_status };
    const f = Math.min(taken / of, 1);
    if (!reversed) {
      // to 1e-12, so 0.7 - 0.4 is stored as the 0.3 it is
      const left = Math.round(((cur?.share ?? 0) - f) * 1e12) / 1e12;
      await tx
        .update(donations)
        .set({ refunded_share: left > 0 ? left : null })
        .where(eq(donations.id, don.id));
    }

    const parts = new Map<string, Part>();
    const add = (key: string, p: Part) => {
      const was = parts.get(key);
      parts.set(
        key,
        was
          ? { ...p, received: was.received + p.received, fee: was.fee + p.fee }
          : p
      );
    };
    const by_hand: string[] = [];
    for (const d of ds) {
      const hand = taken_by_hand(d);
      if (hand) by_hand.push(`dist ${d.id} to ${dist_npo(d)}: ${hand}`);
      if (owed_on_record(d)) {
        add(`npo:${d.to_id}`, {
          party: { npo_id: d.to_id },
          received: scaled(d.net - cash_recovered(d), f),
          fee: scaled(fee_processing_usd(d), f),
        });
      }
      const c = d.commission;
      // paid, or left `refunded_loss` by a reversal that found it paid or
      // claimed by a transfer
      if (c?.status === "paid" || c?.status === "refunded_loss") {
        const party = referrer_of(c);
        add(`ref:${JSON.stringify(party)}`, {
          party,
          received: scaled(c.amount, f),
          fee: 0,
        });
      }
    }

    const credited: string[] = [];
    for (const { party, received, fee } of parts.values()) {
      const was = await owed_for_party(don.id, party, tx);
      if (!was) continue;
      const short =
        received +
        fee -
        (owed_total(was) - was.credited_back_usd - was.written_off_usd);
      if (was.written_off_usd > 0 && short > 0.005) {
        const logs = await write_off_logs(tx, don.id, party);
        // a write-off's loss log is keyed `write_off:<its entry's ref>`
        const entries = logs.map((l) => l.replace(/^write_off:/, ""));
        by_hand.push(
          `${party_name(party, ds)}: $${humanize(Math.min(short, was.written_off_usd))} of the refund's share was written off, so not credited back; reverse by hand owed row ${was.id}'s write-off ${entries.join(", ")}, which still nets it off what a later refund records, and its loss log ${logs.join(", ")}`
        );
      }
      const row = await credit_parts(
        tx,
        was,
        { donation_id: don.id, party, now },
        [
          ["refund_failed", received, refund_failed_ref(refund.id)],
          ["refund_failed_fee", fee, `refund_failed_fee:${refund.id}`],
        ]
      );
      credited.push(
        `$${humanize(row.credited_back_usd - was.credited_back_usd)} credited back to ${party_name(party, ds)}; outstanding now $${humanize(row.outstanding_usd ?? 0)}`
      );
    }
    return by_hand.length > 0
      ? { status: "by_hand", donation_status, credited, by_hand }
      : { status: "credited", donation_status, credited };
  });
}

/** the loss logs the party's write-offs of its row on the gift booked */
async function write_off_logs(tx: DbOrTx, donation_id: string, p: OwedParty) {
  const rows = await tx
    .select({ id: loss_logs.id })
    .from(loss_logs)
    .where(
      and(
        eq(loss_logs.donation_id, donation_id),
        eq(loss_logs.type, "write_off"),
        "npo_id" in p
          ? eq(loss_logs.npo_id, p.npo_id)
          : "referrer_user" in p
            ? eq(loss_logs.referrer_user, p.referrer_user)
            : eq(loss_logs.referrer_npo, p.referrer_npo)
      )
    )
    .orderBy(loss_logs.date);
  return rows.map((l) => l.id);
}

interface Part {
  party: OwedParty;
  /** what the failed refund recorded the party as receiving, and its card fee */
  received: number;
  fee: number;
}

const dist_npo = (d: LockedDist) =>
  `${d.to_name || "its npo"} (npo ${d.to_id})`;

const party_name = (p: OwedParty, ds: LockedDist[]) => {
  if (!("npo_id" in p)) {
    return `referrer ${"referrer_user" in p ? p.referrer_user : p.referrer_npo}`;
  }
  const d = ds.find((x) => x.to_id === p.npo_id);
  return d ? dist_npo(d) : `npo ${p.npo_id}`;
};

/** whether the dist's npo was recorded as owing it: its grant had gone out
 * when the refund landed, or a reversal's shortfall left it owed */
const owed_on_record = (d: LockedDist) =>
  d.status === "settled" ? grant_went_out(d) : d.refund_status === "loss";

/** the cash share a reversal took back by cancelling the dist's pending
 * payout, the rest of it owed for a shortfall */
const cash_recovered = (d: LockedDist) =>
  d.refund_status === "loss" && d.payout_type === "refunded"
    ? (d.cash_pct / 100) * d.net
    : 0;

/** what of the dist the refund moved outside the ledger, for ops to undo */
function taken_by_hand(d: LockedDist): string | null {
  if (d.status === "settled") {
    return grant_went_out(d)
      ? null
      : "its partial refund recorded nothing while its grant hadn't gone out, so undo any hand adjustment made for it";
  }
  if (d.refund_status === "completed") {
    return "its reversal took it back from the npo's balances or pending payout; re-settle it by hand";
  }
  return cash_recovered(d) > 0
    ? "its reversal cancelled its pending payout; re-settle that by hand"
    : null;
}
