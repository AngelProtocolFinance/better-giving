import { and, eq, getTableColumns, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { finite } from "../schema/columns";
import { owed_amounts, owed_entries } from "../schema/owed";
import type { DbOrTx } from "./helpers";

export type IOwed = typeof owed_amounts.$inferSelect;

export type OwedParty =
  | { npo_id: number }
  | { referrer_user: string }
  | { referrer_npo: string };

/** the gift's cumulative figure for `party`, across every refund and dispute
 * on it so far, never one event's share */
export interface IOwedRecord {
  donation_id: string;
  party: OwedParty;
  source: IOwed["source"];
  source_ref: string;
  received_usd: number;
  fee_processing_usd: number;
  fee_dispute_usd?: number;
  now: string;
}

const grown = (col: AnyPgColumn) =>
  sql`GREATEST(${col}, excluded.${sql.identifier(col.name)})`;

const owed_total = sql`${owed_amounts.received_usd} + ${owed_amounts.fee_processing_usd} + ${owed_amounts.fee_dispute_usd}`;

export async function record_owed(tx: DbOrTx, r: IOwedRecord): Promise<IOwed> {
  const [row] = await tx
    .insert(owed_amounts)
    .values({
      donation_id: r.donation_id,
      ...r.party,
      source: r.source,
      source_ref: r.source_ref,
      recorded_at: r.now,
      received_usd: r.received_usd,
      fee_processing_usd: r.fee_processing_usd,
      fee_dispute_usd: r.fee_dispute_usd ?? 0,
    })
    .onConflictDoUpdate({
      target: PARTY_KEY,
      // each figure only grows, so a smaller one is a stale event arriving
      // late; the first event's source stands
      set: {
        received_usd: grown(owed_amounts.received_usd),
        fee_processing_usd: grown(owed_amounts.fee_processing_usd),
        fee_dispute_usd: grown(owed_amounts.fee_dispute_usd),
      },
      setWhere: sql`excluded.received_usd > ${owed_amounts.received_usd}
        OR excluded.fee_processing_usd > ${owed_amounts.fee_processing_usd}
        OR excluded.fee_dispute_usd > ${owed_amounts.fee_dispute_usd}`,
    })
    .returning();
  // no row back: the conflict's update was skipped, and the row stands as it was
  return row ?? (await owed_for_party(r.donation_id, r.party, tx))!;
}

export type OwedCreditReason = "payout_cancelled" | "transfer_unfunded";

export interface IOwedCredit {
  donation_id: string;
  party: OwedParty;
  /** an increment; absent credits all that is still creditable: owed less
   * what was credited and written off. any of it already recovered becomes
   * due back */
  usd?: number;
  reason: OwedCreditReason;
  /** what the credit answers to; a second credit under one ref adds nothing */
  ref: string;
  now: string;
}

/** null when the gift owes nothing for `party` */
export async function credit_owed(
  tx: DbOrTx,
  c: IOwedCredit
): Promise<IOwed | null> {
  const usd =
    c.usd === undefined
      ? sql`${owed_total} - ${owed_amounts.credited_back_usd} - ${owed_amounts.written_off_usd}`
      : sql`${finite(c.usd, "credit_owed usd")}::numeric`;
  return put_entry(tx, "credit", c, usd);
}

export interface IOwedRecovery {
  donation_id: string;
  party: OwedParty;
  usd: number;
  reason: "grant_run";
  /** the run; a second recovery under one ref adds nothing */
  ref: string;
  now: string;
}

/** null when the gift owes nothing for `party` */
export async function recover_owed(
  tx: DbOrTx,
  r: IOwedRecovery
): Promise<IOwed | null> {
  return put_entry(
    tx,
    "recover",
    r,
    sql`${finite(r.usd, "recover_owed usd")}::numeric`
  );
}

/** @deprecated use `credit_owed`. `usd` here is the row's whole credit so far,
 * not an increment; absent credits back all that is creditable */
export async function credit_back(
  tx: DbOrTx,
  c: Omit<IOwedCredit, "reason" | "ref">
): Promise<IOwed | null> {
  const target =
    c.usd === undefined
      ? sql`${owed_total} - ${owed_amounts.written_off_usd}`
      : sql`${finite(c.usd, "credit_back usd")}::numeric`;
  return put_entry(
    tx,
    "credit",
    {
      ...c,
      // the two credits unfunded.ts makes
      reason: c.usd === undefined ? "transfer_unfunded" : "payout_cancelled",
      ref: `credit_back:${c.now}`,
    },
    sql`${target} - ${owed_amounts.credited_back_usd}`
  );
}

type IOwedEntry = typeof owed_entries.$inferSelect;

/** inserts the entry and adds it to its row's sum in one statement, the row
 * locked first so a concurrent entry computes `usd` against this one's sum */
async function put_entry(
  tx: DbOrTx,
  kind: keyof typeof SUM_OF,
  e: {
    donation_id: string;
    party: OwedParty;
    reason: string;
    ref: string;
    now: string;
  },
  usd: SQL
): Promise<IOwed | null> {
  const entry = tx.$with("entry").as(
    tx
      .insert(owed_entries)
      .select(
        tx
          // drizzle's insert-select wants every column, in table order
          .select({
            id: sql<string>`gen_random_uuid()::text`.as("id"),
            owed_id: owed_amounts.id,
            kind: sql<IOwedEntry["kind"]>`${kind}`.as("kind"),
            usd: sql<number>`${usd}`.as("usd"),
            reason: sql<string>`${e.reason}`.as("reason"),
            ref: sql<string>`${e.ref}`.as("ref"),
            at: sql<string>`${e.now}::timestamptz`.as("at"),
            actor: sql<string | null>`null`.as("actor"),
          })
          .from(owed_amounts)
          .where(
            and(
              eq(owed_amounts.donation_id, e.donation_id),
              party_is(e.party),
              sql`${usd} > 0`
            )
          )
          .for("update")
      )
      .onConflictDoNothing({
        target: [owed_entries.owed_id, owed_entries.kind, owed_entries.ref],
      })
      .returning({ owed_id: owed_entries.owed_id, usd: owed_entries.usd })
  );
  const [row] = await tx
    .with(entry)
    .update(owed_amounts)
    .set(SUM_OF[kind](sql`${entry.usd}`, e.now))
    .from(entry)
    .where(eq(owed_amounts.id, entry.owed_id))
    .returning(getTableColumns(owed_amounts));
  return row ?? (await owed_for_party(e.donation_id, e.party, tx)) ?? null;
}

const SUM_OF = {
  credit: (usd: SQL, at: string) => ({
    credited_back_usd: sql`${owed_amounts.credited_back_usd} + ${usd}`,
    credited_back_at: at,
  }),
  recover: (usd: SQL, at: string) => ({
    recovered_usd: sql`${owed_amounts.recovered_usd} + ${usd}`,
    recovered_at: at,
  }),
};

const PARTY_KEY = [
  owed_amounts.donation_id,
  owed_amounts.npo_id,
  owed_amounts.referrer_user,
  owed_amounts.referrer_npo,
];

const party_is = (p: OwedParty) =>
  "npo_id" in p
    ? eq(owed_amounts.npo_id, p.npo_id)
    : "referrer_user" in p
      ? eq(owed_amounts.referrer_user, p.referrer_user)
      : eq(owed_amounts.referrer_npo, p.referrer_npo);

export async function owed_for_party(
  donation_id: string,
  party: OwedParty,
  tx: DbOrTx = db
): Promise<IOwed | undefined> {
  const [row] = await tx
    .select()
    .from(owed_amounts)
    .where(and(eq(owed_amounts.donation_id, donation_id), party_is(party)));
  return row;
}

export async function owed_for_donation(
  donation_id: string,
  tx: DbOrTx = db
): Promise<IOwed[]> {
  return tx
    .select()
    .from(owed_amounts)
    .where(eq(owed_amounts.donation_id, donation_id));
}
