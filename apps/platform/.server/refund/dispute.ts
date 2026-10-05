import { db } from "../pg/db";
import {
  dispute_close,
  dispute_get,
  dispute_open,
  type IDispute,
} from "../pg/queries/dispute";
import {
  credit_owed,
  type IOwed,
  type OwedParty,
  owed_for_donation,
  owed_total,
  record_owed,
} from "../pg/queries/owed";
import { load_reversible, type Rail, type Unreversible } from "./reverse";
import {
  fraction_of,
  owed_shares,
  type Share,
  settled_dists_locked,
} from "./share";

export interface DisputeOpened {
  donation_id: string;
  rail: Rail;
  /** the provider's dispute id: the dispute's record, and what the owed rows
   * it writes answer to */
  dispute_id: string;
  /** when the provider opened it */
  opened_at: string;
  /** how much of the charge is taken back so far, this dispute included */
  share: Share;
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
   * one's ref standing — a second dispute on one payment owes nothing of its
   * own, and a win of it credits nothing */
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
 * a chargeback opened on a gift: records the dispute, and as owed the share
 * of the charge taken back so far of what each npo on the gift received plus
 * its card fee, its part of the dispute fee in full, and that share of each
 * referrer's paid commission. the gift stays settled until the dispute
 * closes.
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
    const rows: IOwed[] = [];
    const shares = owed_shares(ds, {
      // an unsizable share is the whole: the open owes as much as it can, and
      // a win credits it all back
      f: fraction_of(d.share) ?? 1,
      fee_usd: d.fee_usd,
      owes: () => true,
    });
    for (const share of shares) {
      rows.push(
        await record_owed(tx, {
          ...share,
          donation_id: don.id,
          source: "dispute",
          source_ref: d.dispute_id,
          now,
        })
      );
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
 * a chargeback closed in the gift's favour: the money came back, so every
 * row its open recorded is credited back in full. what was already recovered
 * from a party's grants is then due back to it.
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
    status: "won" as const,
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
    const rows: IOwed[] = [];
    for (const o of await owed_for_donation(don.id, tx)) {
      if (o.source !== "dispute" || o.source_ref !== d.dispute_id) continue;
      const credited = await credit_owed(tx, {
        donation_id: don.id,
        party: party_of(o),
        reason: "dispute_won",
        ref: d.dispute_id,
        now,
      });
      rows.push(credited ?? o);
    }
    return rows;
  });
  return { status: "credited", owed };
}

const party_of = (o: IOwed): OwedParty =>
  o.npo_id !== null
    ? { npo_id: o.npo_id }
    : o.referrer_user !== null
      ? { referrer_user: o.referrer_user }
      : { referrer_npo: o.referrer_npo! };
