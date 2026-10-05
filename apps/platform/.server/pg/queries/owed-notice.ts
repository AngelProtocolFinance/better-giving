import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { owed_amounts, owed_notices } from "../schema/owed";
import type { DbOrTx } from "./helpers";
import type { OwedParty } from "./owed";
import { type IOwedHistoryRow, owed_history_row } from "./owed-history";

export type IOwedNotice = typeof owed_notices.$inferSelect;

/** must outlast the sender's longest run, or a live holder loses its claim */
export const OWED_NOTICE_LEASE_MS = 15 * 60 * 1000;

const lease_cutoff = sql`now() - make_interval(secs => ${OWED_NOTICE_LEASE_MS / 1000})`;

const claimable = and(
  isNull(owed_notices.sent_at),
  or(isNull(owed_notices.claimed_at), lt(owed_notices.claimed_at, lease_cutoff))
);

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
    .where(claimable)
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
    .where(and(eq(owed_notices.id, id), claimable))
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
    .select({ sent_at: owed_notices.sent_at })
    .from(owed_notices)
    .where(eq(owed_notices.id, id));
  return !notice || notice.sent_at ? { status: "done" } : { status: "busy" };
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
