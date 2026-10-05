import { and, asc, eq } from "drizzle-orm";
import { db } from "../pg/db";
import {
  dispute_close,
  dispute_open,
  type IDispute,
} from "../pg/queries/dispute";
import type { DbOrTx } from "../pg/queries/helpers";
import {
  credit_owed,
  type IOwed,
  type IOwedRecord,
  type OwedParty,
  owed_for_donation,
  record_owed,
} from "../pg/queries/owed";
import { dists } from "../pg/schema/dist";
import { referrer_commissions } from "../pg/schema/referrer";
import { dist_settled_usd, fee_processing_usd, referrer_of } from "./plan";
import {
  load_reversible,
  type Rail,
  type Unreversible,
  unreversible,
} from "./reverse";

export interface DisputeOpened {
  donation_id: string;
  rail: Rail;
  /** the provider's dispute id: the dispute's record, and what the owed rows
   * it writes answer to */
  dispute_id: string;
  /** when the provider opened it */
  opened_at: string;
  /** what the provider charged for the dispute, in usd; 0 when none */
  fee_usd: number;
}

export type DisputeOpenedResult =
  /** `owed`: each party's row as it stands. `inserted`: this call put the
   * dispute on record, which exactly one call per dispute does.
   * `owed_written`: this call grew what a row owes — an inquiry's escalation
   * on record included; never a redelivery, nor a second dispute that adds
   * nothing. `prior_refs`: the refunds or disputes whose rows this one found
   * and merged into, the first one's ref standing — a second dispute on one
   * payment owes nothing of its own, and a win of it credits nothing */
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
 * a chargeback opened on a gift: records the dispute, and as owed what each
 * npo on the gift received plus its card fee and its share of the dispute
 * fee, and each referrer its paid commission. the gift stays settled until
 * the dispute closes.
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
    for (const f of owed_at_open(ds, d.fee_usd)) {
      rows.push(
        await record_owed(tx, {
          ...f,
          donation_id: don.id,
          source: "dispute",
          source_ref: d.dispute_id,
          now,
        })
      );
    }
    const prior_refs = [
      ...new Set(
        rows.map((o) => o.source_ref).filter((ref) => ref !== d.dispute_id)
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

/** what a row records as owed, before anything settles it */
const owed_total = (o: IOwed) =>
  o.received_usd + o.fee_processing_usd + o.fee_dispute_usd;

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
  { status: "credited"; owed: IOwed[] } | Unreversible;

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
    await dispute_close(db, record);
    return unreversible(loaded);
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

type OpenDist = Awaited<ReturnType<typeof settled_dists_locked>>[number];

type OwedAtOpen = Pick<
  IOwedRecord,
  "party" | "received_usd" | "fee_processing_usd" | "fee_dispute_usd"
>;

/** one figure per party: each npo what its dists received, their card fees
 * and their share of the dispute fee by settled amount; each referrer its
 * paid commissions */
function owed_at_open(ds: OpenDist[], fee_usd: number): OwedAtOpen[] {
  const fee_shares = split_cents(fee_usd, ds.map(dist_settled_usd));
  const by_party = new Map<string, OwedAtOpen>();
  const add = (key: string, f: OwedAtOpen) => {
    const was = by_party.get(key);
    by_party.set(
      key,
      was
        ? {
            party: f.party,
            received_usd: was.received_usd + f.received_usd,
            fee_processing_usd: was.fee_processing_usd + f.fee_processing_usd,
            fee_dispute_usd:
              (was.fee_dispute_usd ?? 0) + (f.fee_dispute_usd ?? 0),
          }
        : f
    );
  };
  for (const [i, x] of ds.entries()) {
    add(`npo:${x.to_id}`, {
      party: { npo_id: x.to_id },
      received_usd: x.net,
      fee_processing_usd: fee_processing_usd(x),
      fee_dispute_usd: fee_shares[i]!,
    });
    const c = x.commission;
    if (c?.status !== "paid") continue;
    const party = referrer_of(c);
    add(`ref:${JSON.stringify(party)}`, {
      party,
      received_usd: c.amount,
      fee_processing_usd: 0,
    });
  }
  return [...by_party.values()];
}

/** `usd` split in whole cents in proportion to `weights`, the cents rounding
 * leaves going to the largest remainders, so the shares sum to `usd` */
function split_cents(usd: number, weights: number[]): number[] {
  const cents = Math.round(usd * 100);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (cents * w) / total);
  const shares = exact.map(Math.floor);
  let left = cents - shares.reduce((s, c) => s + c, 0);
  const by_remainder = exact
    .map((e, i) => [e - shares[i]!, i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of by_remainder) {
    if (left-- <= 0) break;
    shares[i]! += 1;
  }
  return shares.map((c) => c / 100);
}

/** the gift's dists not yet reversed, each with its commission, held locked:
 * a reversal of one waits */
async function settled_dists_locked(tx: DbOrTx, donation_id: string) {
  const rows = await tx
    .select({
      id: dists.id,
      to_id: dists.to_id,
      net: dists.net,
      fee_base: dists.fee_base,
      fee_fsa: dists.fee_fsa,
      fee_processing: dists.fee_processing,
      fee_allowance: dists.fee_allowance,
      commission: {
        amount: referrer_commissions.amount,
        status: referrer_commissions.status,
        referrer_user: referrer_commissions.referrer_user,
        referrer_npo: referrer_commissions.referrer_npo,
      },
    })
    .from(dists)
    .leftJoin(
      referrer_commissions,
      eq(referrer_commissions.donation_id, dists.id)
    )
    .where(and(eq(dists.donation_id, donation_id), eq(dists.status, "settled")))
    .orderBy(asc(dists.id))
    .for("update", { of: dists });
  return rows.map((r) => ({
    id: r.id,
    to_id: r.to_id ?? 0,
    net: r.net ?? 0,
    fee_base: r.fee_base ?? 0,
    fee_fsa: r.fee_fsa ?? 0,
    fee_processing: r.fee_processing ?? 0,
    fee_allowance: r.fee_allowance ?? 0,
    commission: r.commission,
  }));
}
