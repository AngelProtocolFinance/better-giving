import { db } from "../pg/db";
import {
  dispute_close,
  dispute_get,
  dispute_open,
  dispute_record_share,
  disputes_lost_of,
  type IDispute,
} from "../pg/queries/dispute";
import {
  type IOwed,
  owed_for_donation,
  owed_for_party,
  owed_total,
  record_owed,
} from "../pg/queries/owed";
import { load_reversible, type Rail, type Unreversible } from "./reverse";
import {
  credit_parts,
  fraction_of,
  grant_went_out,
  type LockedDist,
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
  /** how much of the charge is taken back so far, this dispute included;
   * the gift's disputes on record lost are added by the open itself */
  share: Share;
  /** the dispute's own part of the charge, what a win of it credits back;
   * absent, `share` */
  disputed?: Share;
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
    const lost = await disputes_lost_of(tx, don.id, d.dispute_id);
    const lost_share = lost.reduce((sum, l) => sum + l.share, 0);
    // an unsizable share is the whole: the open owes as much as it can, and
    // a win credits it all back
    const taken = fraction_of(d.share) ?? 1;
    const own = fraction_of(d.disputed ?? d.share) ?? taken;
    const cumulative = Math.min(taken + lost_share, 1);
    const rows: IOwed[] = [];
    const shares = owed_shares(ds, {
      f: cumulative,
      f_of: by_grant(cumulative, Math.min(own + lost_share, 1)),
      fee_usd: d.fee_usd + lost.reduce((sum, l) => sum + l.fee_usd, 0),
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
    if (rows.length > 0) {
      await dispute_record_share(tx, d.dispute_id, {
        share: Math.min(own, cumulative),
        cumulative_share: cumulative,
        fee_usd: d.fee_usd,
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
 * a chargeback closed in the gift's favour: the money came back, so each
 * party's row is credited back the dispute's own share of what the party
 * received and its card fee, and its part of the dispute fee, whatever else
 * wrote the row. a later record of the row no longer counts it. what was
 * already recovered from a party's grants is then due back to it.
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
    // set by an open that recorded what is owed; none, it owes nothing
    const own = await dispute_get(d.dispute_id, tx);
    if (own?.share == null) return [];
    const ds = await settled_dists_locked(tx, don.id);
    const lost = await disputes_lost_of(tx, don.id, d.dispute_id);
    const lost_share = lost.reduce((sum, l) => sum + l.share, 0);
    const cumulative = own.cumulative_share ?? own.share;
    const disputes = Math.min(own.share + lost_share, 1);
    // what the open recorded, less what it would have without this dispute:
    // the difference of two floors, so no cent of another event is credited
    const at = owed_shares(ds, {
      f: cumulative,
      f_of: by_grant(cumulative, disputes),
      fee_usd: own.fee_usd ?? 0,
      owes: () => true,
    });
    const below = new Map(
      owed_shares(ds, {
        f: cumulative - own.share,
        f_of: by_grant(cumulative - own.share, disputes - own.share),
        fee_usd: 0,
        owes: () => true,
      }).map((b) => [JSON.stringify(b.party), b])
    );
    const rows: IOwed[] = [];
    for (const s of at) {
      const row = await owed_for_party(don.id, s.party, tx);
      if (!row) continue;
      const b = below.get(JSON.stringify(s.party));
      const id = d.dispute_id;
      rows.push(
        await credit_parts(
          tx,
          row,
          { donation_id: don.id, party: s.party, now },
          [
            ["dispute_won", s.received_usd - (b?.received_usd ?? 0), id],
            [
              "dispute_won_fee",
              s.fee_processing_usd - (b?.fee_processing_usd ?? 0),
              `${id}:fee`,
            ],
            [
              "dispute_won_fee_dispute",
              s.fee_dispute_usd ?? 0,
              `${id}:fee_dispute`,
            ],
          ]
        )
      );
    }
    return rows;
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

/** a dist's share at an open: the whole share taken back once its grant has
 * gone out, else only the disputes' own, since a refund of a grant not yet
 * out is left to ops' hand adjustment and owes nothing on record */
const by_grant = (cumulative: number, disputes: number) => (d: LockedDist) =>
  grant_went_out(d) ? cumulative : disputes;
