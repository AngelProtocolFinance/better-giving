import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { finite } from "../schema/columns";
import { owed_amounts } from "../schema/owed";
import type { DbOrTx } from "./helpers";

export type IOwed = typeof owed_amounts.$inferSelect;

export type OwedParty =
  | { npo_id: number }
  | { referrer_user: string }
  | { referrer_npo: string };

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
      set: {
        source: sql`excluded.source`,
        source_ref: sql`excluded.source_ref`,
        received_usd: sql`excluded.received_usd`,
        fee_processing_usd: sql`excluded.fee_processing_usd`,
        fee_dispute_usd: sql`excluded.fee_dispute_usd`,
      },
      // the figure is cumulative and only grows, so a smaller one is a stale event arriving late
      setWhere: sql`excluded.received_usd + excluded.fee_processing_usd + excluded.fee_dispute_usd > ${owed_total}`,
    })
    .returning();
  // no row back: the conflict's update was skipped, and the row stands as it was
  return row ?? (await owed_row(tx, r.donation_id, r.party))!;
}

export interface IOwedCredit {
  donation_id: string;
  party: OwedParty;
  /** the row's whole credit so far, not an increment; absent credits back
   * everything it owes, so any of it already recovered becomes due back */
  usd?: number;
  now: string;
}

/** a credit only grows, so a repeat leaves the row and its credit date as they
 * were. null when the gift owes nothing for `party` */
export async function credit_back(
  tx: DbOrTx,
  c: IOwedCredit
): Promise<IOwed | null> {
  const credited =
    c.usd === undefined
      ? owed_total
      : sql`${finite(c.usd, "credit_back usd")}::numeric`;
  const [row] = await tx
    .update(owed_amounts)
    .set({ credited_back_usd: credited, credited_back_at: c.now })
    .where(
      and(
        eq(owed_amounts.donation_id, c.donation_id),
        party_is(c.party),
        sql`${owed_amounts.credited_back_usd} < ${credited}`
      )
    )
    .returning();
  return row ?? (await owed_row(tx, c.donation_id, c.party)) ?? null;
}

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

async function owed_row(
  tx: DbOrTx,
  donation_id: string,
  party: OwedParty
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
