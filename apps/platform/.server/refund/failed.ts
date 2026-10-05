import { and, eq } from "drizzle-orm";
import { type IDonation, is_reversed } from "@/donations";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import { donation_lock } from "../pg/queries/donation";
import type { DbOrTx } from "../pg/queries/helpers";
import { type OwedParty, owed_for_party, owed_total } from "../pg/queries/owed";
import { refund_failed_ref } from "../pg/queries/owed-refund";
import { type ITake, take_undo, takes_of } from "../pg/queries/take";
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
import { mirror_refunded_share, owed_targets, taken_of } from "./takes";

export interface RefundFailed {
  donation_id: string;
  rail: Rail;
  /** the refund that failed: its provider id, the take it is on record
   * under and what each credit answers to */
  refund_id: string;
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
 * its take is undone and each party's row is credited back what the takes
 * owed with it less what they owe without it. what was already recovered of
 * it becomes due back. a reversed gift is not re-settled: what its reversal
 * took outside the ledger is ops' to undo by hand.
 *
 * safe to rerun: a redelivery credits nothing more.
 */
export async function refund_failed(
  r: RefundFailed
): Promise<RefundFailedResult> {
  const loaded = await load_reversible(r.donation_id, r.rail);
  if (loaded.status === "failed") return loaded;
  const { don } = loaded;
  const now = new Date().toISOString();

  return db.transaction(async (tx): Promise<RefundFailedResult> => {
    const ds = await gift_dists_locked(tx, don.id);
    await donation_lock(tx, don.id);
    const [cur] = await tx
      .select({ status: donations.status })
      .from(donations)
      .where(eq(donations.id, don.id));
    // the column is text; its check holds it to the statuses
    const donation_status = (cur?.status ?? don.status) as IDonation["status"];
    const before = await takes_of(tx, don.id);
    const take = before.find(
      (t) =>
        t.ref === r.refund_id && t.kind === "refund" && t.status === "active"
    );
    // never recorded (it failed while held), or undone by an earlier run
    if (!take || !(await take_undo(tx, don.id, take.ref))) {
      return { status: "not_recorded", donation_status };
    }
    const after = await takes_of(tx, don.id);
    const reversed = is_reversed(donation_status);
    if (!reversed) await mirror_refunded_share(tx, don.id, after);

    const parts = reversed
      ? reversed_parts(ds, taken_of(before), taken_of(after))
      : settled_parts(
          ds.filter((d) => d.status === "settled"),
          before,
          after
        );
    const by_hand = ds.flatMap((d) => {
      const hand = taken_by_hand(d);
      return hand ? [`dist ${d.id} to ${dist_npo(d)}: ${hand}`] : [];
    });

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
          ["refund_failed", received, refund_failed_ref(take.ref)],
          ["refund_failed_fee", fee, `refund_failed_fee:${take.ref}`],
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

/** what the takes owed each party on a gift still settled, less what they
 * owe without the failed refund's */
function settled_parts(
  ds: LockedDist[],
  before: ITake[],
  after: ITake[]
): Part[] {
  const was = owed_targets(ds, before);
  const now = owed_targets(ds, after);
  return [...was.entries()].map(([key, b]) => {
    const a = now.get(key);
    return {
      party: b.party,
      received: b.received_usd - (a?.received_usd ?? 0),
      fee: b.fee_processing_usd - (a?.fee_processing_usd ?? 0),
    };
  });
}

/** on a reversed gift, what each party owes for the share `from` that its
 * reversal recorded, less what it owes for the share `to` left without the
 * failed refund: each dist the reversal left owed (a shortfall, less the cash
 * a cancelled payout took back), and each commission it found paid */
function reversed_parts(ds: LockedDist[], from: number, to: number): Part[] {
  const fall = (x: number) => scaled(x, from) - scaled(x, to);
  const parts = new Map<string, Part>();
  const add = (p: Part) => {
    const key = JSON.stringify(p.party);
    const was = parts.get(key);
    parts.set(
      key,
      was
        ? { ...p, received: was.received + p.received, fee: was.fee + p.fee }
        : p
    );
  };
  for (const d of ds) {
    if (d.refund_status === "loss") {
      add({
        party: { npo_id: d.to_id },
        received: fall(d.net - cash_recovered(d)),
        fee: fall(fee_processing_usd(d)),
      });
    }
    const c = d.commission;
    // paid, or left `refunded_loss` by a reversal that found it paid or
    // claimed by a transfer
    if (c?.status === "paid" || c?.status === "refunded_loss") {
      add({ party: referrer_of(c), received: fall(c.amount), fee: 0 });
    }
  }
  return [...parts.values()];
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
