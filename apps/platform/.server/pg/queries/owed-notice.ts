import { and, asc, eq, exists, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { donations } from "../schema/donation";
import { owed_amounts, owed_notices } from "../schema/owed";
import type { DbOrTx } from "./helpers";
import { type OwedParty, owed_reaches_party } from "./owed";
import { type IOwedHistoryRow, owed_history_row } from "./owed-history";

export type IOwedNotice = typeof owed_notices.$inferSelect;

/** must outlast the sender's longest run, or a live holder loses its claim */
export const OWED_NOTICE_LEASE_MS = 15 * 60 * 1000;

const lease_cutoff = sql`now() - make_interval(secs => ${OWED_NOTICE_LEASE_MS / 1000})`;

/** the notice's row still reaches its party: a date moved later drops what
 * was queued under the earlier one */
const reaches = (tx: DbOrTx) =>
  exists(
    // a join, so drizzle qualifies every column, the outer notice's included
    tx
      .select({ one: sql`1` })
      .from(owed_amounts)
      .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
      .where(
        and(eq(owed_amounts.id, owed_notices.owed_id), owed_reaches_party())
      )
  );

const claimable = (tx: DbOrTx) =>
  and(
    isNull(owed_notices.sent_at),
    or(
      isNull(owed_notices.claimed_at),
      lt(owed_notices.claimed_at, lease_cutoff)
    ),
    reaches(tx)
  );

/** a `recorded` notice for each row that owes, reaches its party, and has
 * none: a row recorded before the effective date was set has had no notice
 * queued. safe to run any number of times; the count it queued */
export async function queue_owed_notices_missed(
  tx: DbOrTx = db
): Promise<number> {
  const queued = await tx
    .insert(owed_notices)
    .select(
      tx
        // drizzle's insert-select wants every column, in table order
        .select({
          id: sql<string>`gen_random_uuid()::text`.as("id"),
          owed_id: owed_amounts.id,
          kind: sql<IOwedNotice["kind"]>`'recorded'`.as("kind"),
          round: sql<number>`0`.as("round"),
          created_at: sql<string>`now()`.as("created_at"),
          claimed_at: sql<string | null>`null`.as("claimed_at"),
          sent_at: sql<string | null>`null`.as("sent_at"),
        })
        .from(owed_amounts)
        .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
        .where(
          and(
            owed_reaches_party(),
            sql`${owed_amounts.outstanding_usd} >= 0.01`,
            sql`NOT EXISTS (SELECT 1 FROM ${owed_notices}
              WHERE ${owed_notices.owed_id} = ${owed_amounts.id} AND ${owed_notices.kind} = 'recorded')`
          )
        )
    )
    .onConflictDoNothing({
      target: [owed_notices.owed_id, owed_notices.kind, owed_notices.round],
    })
    .returning({ id: owed_notices.id });
  return queued.length;
}

/** notices to send, oldest first: unsent, and unclaimed or past their lease */
export function owed_notices_due(
  limit = 50,
  tx: DbOrTx = db
): Promise<Pick<IOwedNotice, "id" | "owed_id" | "kind">[]> {
  return tx
    .select({
      id: owed_notices.id,
      owed_id: owed_notices.owed_id,
      kind: owed_notices.kind,
    })
    .from(owed_notices)
    .where(claimable(tx))
    .orderBy(asc(owed_notices.created_at), asc(owed_notices.id))
    .limit(limit);
}

/**
 * - `claimed`: the caller holds the notice until it marks it sent or releases
 *   `stamp`; `row` is the owed row as it stands now, to mail
 * - `done`: sent, or no such notice — nothing to send, ever
 * - `busy`: another holder's claim is inside its lease, and may yet die
 *   without sending — come back after the lease, don't drop it
 */
export type OwedNoticeClaim =
  | {
      status: "claimed";
      stamp: string;
      kind: IOwedNotice["kind"];
      party: OwedParty;
      row: IOwedHistoryRow;
    }
  | { status: "done" }
  | { status: "busy" };

/** the right to send the notice, under a lease read off the database clock */
export async function claim_owed_notice(
  id: string,
  tx: DbOrTx = db
): Promise<OwedNoticeClaim> {
  const [claimed] = await tx
    .update(owed_notices)
    // ms, so the stamp survives a driver that hands back a Date and still
    // matches `release_owed_notice`'s equality
    .set({ claimed_at: sql`date_trunc('milliseconds', now())` })
    .where(and(eq(owed_notices.id, id), claimable(tx)))
    .returning({
      stamp: owed_notices.claimed_at,
      kind: owed_notices.kind,
      owed_id: owed_notices.owed_id,
    });
  if (claimed?.stamp) {
    const [owed] = await tx
      .select({
        npo_id: owed_amounts.npo_id,
        referrer_user: owed_amounts.referrer_user,
        referrer_npo: owed_amounts.referrer_npo,
      })
      .from(owed_amounts)
      .where(eq(owed_amounts.id, claimed.owed_id));
    const row = await owed_history_row(claimed.owed_id, tx);
    return {
      status: "claimed",
      stamp: claimed.stamp,
      kind: claimed.kind,
      party: party_of(owed!),
      row: row!,
    };
  }

  // read after the miss, so a state that moved in between can only read as
  // busy, whose retry then sees it — a sent stamp never moves back
  const [notice] = await tx
    .select({ sent_at: owed_notices.sent_at, reaches: reaches(tx) })
    .from(owed_notices)
    .where(eq(owed_notices.id, id));
  return !notice || notice.sent_at || !notice.reaches
    ? { status: "done" }
    : { status: "busy" };
}

/** the mail is out; permanent, whoever holds the claim */
export async function mark_owed_notice_sent(
  id: string,
  tx: DbOrTx = db
): Promise<void> {
  await tx
    .update(owed_notices)
    .set({ sent_at: sql`now()` })
    .where(eq(owed_notices.id, id));
}

/** gives back a claim whose send failed, so the next attempt can take it.
 * only the claim `stamp` names: a holder that outlived its lease must not
 * clear the claim a later holder took since */
export async function release_owed_notice(
  id: string,
  stamp: string,
  tx: DbOrTx = db
): Promise<void> {
  await tx
    .update(owed_notices)
    .set({ claimed_at: null })
    .where(
      and(
        eq(owed_notices.id, id),
        eq(owed_notices.claimed_at, stamp),
        isNull(owed_notices.sent_at)
      )
    );
}

const party_of = (o: {
  npo_id: number | null;
  referrer_user: string | null;
  referrer_npo: string | null;
}): OwedParty =>
  o.npo_id !== null
    ? { npo_id: o.npo_id }
    : o.referrer_user !== null
      ? { referrer_user: o.referrer_user }
      : { referrer_npo: o.referrer_npo! };
