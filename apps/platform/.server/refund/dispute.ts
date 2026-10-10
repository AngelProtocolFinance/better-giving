import { db } from "../pg/db";
import {
  dispute_close,
  dispute_get,
  dispute_open,
  dispute_record_share,
  type IDispute,
} from "../pg/queries/dispute";
import { type IOwed, owed_for_donation, owed_total } from "../pg/queries/owed";
import { take_undo, takes_of } from "../pg/queries/take";
import { load_reversible, type Rail, type Unreversible } from "./reverse";
import { fraction_of, type Share, settled_dists_locked } from "./share";
import { dispute_take, move_owed, take_dispute, taken_of } from "./takes";

export interface DisputeOpened {
  donation_id: string;
  rail: Rail;
  /** the provider's dispute id: the dispute's record, and what the owed rows
   * it writes answer to */
  dispute_id: string;
  /** when the provider opened it */
  opened_at: string;
  /** the dispute's own part of the charge, nothing else: what the open adds
   * to what the gift has on record as taken back, and what a win of it
   * credits back. one that can't be sized claims a chargeback recorded
   * before it, else is the rest of the charge: the open owes as much as it
   * can, and a win credits it all back */
  disputed: Share;
  /** what the provider charged for the dispute, in usd; 0 when none */
  fee_usd: number;
}

export type DisputeOpenedResult =
  /** `owed`: each party's row as it stands. `inserted`: this call put the
   * dispute on record, which at most one call per dispute does — none when
   * a record-only open or a close wrote it first. `owed_written`: this call
   * grew what a row owes — an inquiry's escalation on record included; never
   * a redelivery, nor a second dispute that adds nothing. `prior_refs`: the
   * other disputes whose rows this one found and merged into, the first
   * one's ref standing — a second dispute on one payment adds to a row only
   * what the first left uncounted, and a win of it credits its own share */
  | {
      status: "recorded";
      owed: IOwed[];
      inserted: boolean;
      owed_written: boolean;
      prior_refs: string[];
    }
  /** the dispute was already recorded closed: nothing written */
  | {
      status: "closed";
      dispute_status: Exclude<IDispute["status"], "open">;
      inserted: false;
    }
  /** the dispute is on record, and the gift owes nothing more */
  | (Extract<Unreversible, { status: "already_reversed" }> & {
      inserted: boolean;
    })
  | Extract<Unreversible, { status: "failed" }>;

/**
 * a chargeback opened on a gift: records the dispute, puts its own part on
 * the gift's ledger of takes (claiming a chargeback of it recorded before the
 * filing), and moves what each party owes by the difference that makes: see
 * `owed_targets`. the gift stays settled until the dispute closes.
 *
 * safe to rerun: a redelivery records nothing new, and an open handled
 * after the dispute's close (providers don't order their events) none at all.
 */
export async function dispute_opened(
  d: DisputeOpened
): Promise<DisputeOpenedResult> {
  const loaded = await load_reversible(d.donation_id, d.rail);
  if (loaded.status === "failed") return loaded;
  const { don } = loaded;
  const record = {
    id: d.dispute_id,
    donation_id: don.id,
    opened_at: d.opened_at,
  };
  if (loaded.status === "already_reversed") {
    const { inserted } = await dispute_open(db, record);
    const { status, donation_status } = loaded;
    return { status, donation_status, inserted };
  }
  const now = new Date().toISOString();

  return db.transaction(async (tx): Promise<DisputeOpenedResult> => {
    const { status, inserted } = await dispute_open(tx, record);
    if (status !== "open") {
      return { status: "closed", dispute_status: status, inserted: false };
    }
    const ds = await settled_dists_locked(tx, don.id);
    const was = new Map(
      (await owed_for_donation(don.id, tx)).map((o) => [o.id, owed_total(o)])
    );
    const before = await takes_of(tx, don.id);
    await take_dispute(tx, {
      donation_id: don.id,
      dispute_id: d.dispute_id,
      share: fraction_of(d.disputed),
      fee_usd: d.fee_usd,
    });
    const after = await takes_of(tx, don.id);
    const moves = await move_owed(tx, {
      donation_id: don.id,
      ds,
      before,
      after,
      src: { source: "dispute", source_ref: d.dispute_id },
      now,
    });
    const rows = moves.flatMap((m) => (m.row ? [m.row] : []));
    const take = after.find((t) => t.ref === d.dispute_id);
    if (take) {
      await dispute_record_share(tx, d.dispute_id, {
        share: take.share,
        cumulative_share: Math.max(taken_of(after), take.share),
        fee_usd: take.fee_usd,
      });
    }
    const prior_refs = [
      ...new Set(
        rows
          .filter(
            (o) => o.source === "dispute" && o.source_ref !== d.dispute_id
          )
          .map((o) => o.source_ref)
      ),
    ];
    const owed_written = rows.some((o) => owed_total(o) > (was.get(o.id) ?? 0));
    return {
      status: "recorded",
      owed: rows,
      inserted,
      owed_written,
      prior_refs,
    };
  });
}

export interface DisputeWon {
  donation_id: string;
  rail: Rail;
  /** the provider's dispute id */
  dispute_id: string;
  /** how it closed without the buyer keeping the money from the gift: won,
   * a claim accepted that a refund pays, or an inquiry closed; `won` absent */
  status?: "won" | "accepted" | "inquiry_closed";
  /** the dispute's own part of the charge, when the provider states it:
   * finds a chargeback of it recorded before its filing was, as a filing
   * does. absent or unsized, the oldest such chargeback. only a win claims
   * one: a refund pays an accepted claim, an inquiry withdraws nothing, and
   * paypal's NONE leaves any chargeback to the dispute that superseded it */
  disputed?: Share;
  /** when the provider opened it: records the dispute if its open never was */
  opened_at: string;
  closed_at: string;
}

export type DisputeWonResult =
  /** each row the dispute recorded, credited */
  | { status: "credited"; owed: IOwed[] }
  /** the dispute is on record won, and nothing is credited. `prior_status`:
   * its record before this win, null when there was none. `lost` is a late
   * win after this dispute's own loss reversed the gift, so the npo was
   * debited for it; anything else, the gift was reversed some other way */
  | (Extract<Unreversible, { status: "already_reversed" }> & {
      prior_status: IDispute["status"] | null;
    })
  | Extract<Unreversible, { status: "failed" }>;

/**
 * a chargeback closed in the gift's favour, or that no longer counts (a claim
 * accepted, which its refund pays; an inquiry closed): its take is undone, so
 * each party's row is credited back what the takes owed with it less what
 * they owe without it, its dispute fee included, whatever else wrote the row.
 * what was already recovered from a party's grants is then due back to it.
 *
 * safe to rerun: a redelivery credits nothing new.
 */
export async function dispute_won(d: DisputeWon): Promise<DisputeWonResult> {
  const loaded = await load_reversible(d.donation_id, d.rail);
  if (loaded.status === "failed") return loaded;
  const { don } = loaded;
  const record = {
    id: d.dispute_id,
    donation_id: don.id,
    status: d.status ?? "won",
    opened_at: d.opened_at,
    closed_at: d.closed_at,
  };
  if (loaded.status === "already_reversed") {
    // read before the close, which turns an open record won
    const prior = await dispute_get(d.dispute_id);
    await dispute_close(db, record);
    const { status, donation_status } = loaded;
    return { status, donation_status, prior_status: prior?.status ?? null };
  }
  const now = new Date().toISOString();

  const owed = await db.transaction(async (tx) => {
    await dispute_close(tx, record);
    const ds = await settled_dists_locked(tx, don.id);
    const before = await takes_of(tx, don.id);
    const take = await dispute_take(tx, {
      donation_id: don.id,
      dispute_id: d.dispute_id,
      share: d.disputed ? fraction_of(d.disputed) : null,
      claims: (d.status ?? "won") === "won",
    });
    // none on record, or undone already: by a redelivery, or by the refund
    // that paid an accepted claim
    if (!take || !(await take_undo(tx, don.id, take.ref))) return [];
    const after = await takes_of(tx, don.id);
    const moves = await move_owed(tx, {
      donation_id: don.id,
      ds,
      before,
      after,
      src: { source: "dispute", source_ref: d.dispute_id },
      now,
    });
    return moves.flatMap((m) => (m.row ? [m.row] : []));
  });
  return { status: "credited", owed };
}

const usd = (n: number) => `${n.toFixed(2)} USD`;

/** what a dispute's open recorded, for an ops notice: the total, then each
 * party's row as it breaks down */
export const owed_lines = (owed: IOwed[]): string[] => [
  `recorded as owed: ${usd(owed.reduce((s, o) => s + owed_total(o), 0))}`,
  ...owed.map((o) => {
    const party =
      o.npo_id !== null
        ? `npo ${o.npo_id}`
        : `referrer ${o.referrer_user ?? `npo ${o.referrer_npo}`}`;
    return `- ${party}: ${usd(owed_total(o))} (received ${usd(o.received_usd)}, card fee ${usd(o.fee_processing_usd)}, dispute fee ${usd(o.fee_dispute_usd)})`;
  }),
];
