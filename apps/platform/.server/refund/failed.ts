import { eq } from "drizzle-orm";
import type { IDonation } from "@/donations";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import {
  credit_owed,
  type OwedParty,
  owed_for_party,
  owed_total,
} from "../pg/queries/owed";
import { donations } from "../pg/schema/donation";
import { fee_processing_usd, referrer_of } from "./plan";
import { load_reversible, type Rail, type Unreversible } from "./reverse";
import {
  fraction_of,
  gift_dists_locked,
  grant_went_out,
  type LockedDist,
  type Share,
  scaled,
} from "./share";

export interface RefundFailed {
  donation_id: string;
  rail: Rail;
  /** the failed refund's own part of the charge */
  failed_share: Share;
  /** how much of the charge is still taken back, the failed refund no
   * longer counted; nothing taken back is `taken: 0` */
  share: Share;
  /** the provider's refund id: what each credit answers to, so a redelivery
   * credits nothing twice */
  source_ref: string;
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
  | Extract<Unreversible, { status: "failed" }>;

/**
 * a refund that failed after it succeeded: the donor got nothing back, so
 * what each party was recorded as owing for it is credited back, by the
 * refund's share of the charge. what was already recovered of it becomes due
 * back. a gift not reversed has its refunded share set to what is still taken
 * back. only for a refund that had succeeded: one that failed before reaching
 * the reversal entry recorded nothing.
 *
 * safe to rerun: a redelivery credits nothing more.
 */
export async function refund_failed(
  r: RefundFailed
): Promise<RefundFailedResult> {
  const loaded = await load_reversible(r.donation_id, r.rail);
  if (loaded.status === "failed") return loaded;
  const { don } = loaded;
  const f = fraction_of(r.failed_share);
  if (f === null) throw new Error(`refund ${r.source_ref}: no failed share`);
  const now = new Date().toISOString();

  const left = r.share.taken / r.share.of;
  if (!(left >= 0)) throw new Error(`refund ${r.source_ref}: no share left`);

  return db.transaction(async (tx) => {
    const ds = await gift_dists_locked(tx, don.id);
    // set, not grown: the caller counts what the charge has left taken back,
    // so a redelivery sets the same. a reversed gift keeps the last partial's
    if (loaded.status === "reversible" && left < 1) {
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
      let row = was;
      // two entries, so a later record of the row adds each back onto its
      // own figure
      for (const [reason, usd] of [
        ["refund_failed", received],
        ["refund_failed_fee", fee],
      ] as const) {
        const creditable =
          owed_total(row) - row.credited_back_usd - row.written_off_usd;
        if (Math.min(usd, creditable) <= 0) continue;
        row =
          (await credit_owed(tx, {
            donation_id: don.id,
            party,
            usd: Math.min(usd, creditable),
            reason,
            ref: `${reason}:${r.source_ref}`,
            now,
          })) ?? row;
      }
      credited.push(
        `$${humanize(row.credited_back_usd - was.credited_back_usd)} credited back to ${party_name(party, ds)}; outstanding now $${humanize(row.outstanding_usd ?? 0)}`
      );
    }
    const donation_status = don.status;
    return by_hand.length > 0
      ? { status: "by_hand", donation_status, credited, by_hand }
      : { status: "credited", donation_status, credited };
  });
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
