import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { user } from "../schema/auth";
import { finite } from "../schema/columns";
import { donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { owed_amounts, owed_entries } from "../schema/owed";
import { loss_logs } from "../schema/revenue";
import type { DbOrTx, IPage } from "./helpers";

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
  return put_entry(tx, "credit", party_row(c), c, usd);
}

export interface IOwedRecovery {
  donation_id: string;
  party: OwedParty;
  usd: number;
  reason: "grant_run";
  /** the run; a second recovery, or repayment, under one ref adds nothing */
  ref: string;
  now: string;
}

/** the row, with what the entry under the call's ref holds: this call's, or
 * an earlier call's under that ref; 0 when there is none */
export type IOwedWithEntry = IOwed & { entry_usd: number };

/** recovers `usd`, or only what is outstanding when that is less. null when
 * the gift owes nothing for `party` */
export async function recover_owed(
  tx: DbOrTx,
  r: IOwedRecovery
): Promise<IOwedWithEntry | null> {
  const row = await put_entry(
    tx,
    "recover",
    party_row(r),
    r,
    sql`LEAST(${finite(r.usd, "recover_owed usd")}::numeric, ${owed_amounts.outstanding_usd})`
  );
  return row && with_entry(tx, row, "recover", r.ref);
}

export type IOwedRepayment = IOwedRecovery;

/** pays back `usd` of what the party is due back (a negative outstanding), or
 * only what is due when that is less; it comes off the recovered figure. null
 * when the gift owes nothing for `party` */
export async function repay_owed(
  tx: DbOrTx,
  r: IOwedRepayment
): Promise<IOwedWithEntry | null> {
  const row = await put_entry(
    tx,
    "repay",
    party_row(r),
    r,
    sql`LEAST(${finite(r.usd, "repay_owed usd")}::numeric, -${owed_amounts.outstanding_usd})`
  );
  return row && with_entry(tx, row, "repay", r.ref);
}

export interface IOwedUnrecovery {
  npo_id: number;
  /** the run whose recoveries its transfer, found unfunded, never paid for */
  ref: string;
  now: string;
}

/** takes back every recovery the run made from the npo's rows, each by exactly
 * what it took, whatever the row owes now; once per row, so a retry adds
 * nothing. each row comes back with what was taken back from it */
export async function unrecover_owed(
  tx: DbOrTx,
  u: IOwedUnrecovery
): Promise<IOwedWithEntry[]> {
  const of_npo = eq(owed_amounts.npo_id, u.npo_id);
  const e = {
    reason: "transfer_unfunded",
    ref: `unfunded:${u.ref}`,
    now: u.now,
  };
  // a repay under its own ref, uncapped: repay_owed's cap at what is due back
  // would leave a row the run took to $0 with nothing to undo
  await put_entries(
    tx,
    "repay",
    of_npo,
    e,
    sql`(SELECT ${owed_entries.usd} FROM ${owed_entries}
      WHERE ${owed_entries.owed_id} = ${owed_amounts.id}
        AND ${owed_entries.kind} = 'recover' AND ${owed_entries.ref} = ${u.ref})`
  );
  return tx
    .select({ ...getTableColumns(owed_amounts), entry_usd: owed_entries.usd })
    .from(owed_amounts)
    .innerJoin(
      owed_entries,
      and(
        eq(owed_entries.owed_id, owed_amounts.id),
        eq(owed_entries.kind, "repay"),
        eq(owed_entries.ref, e.ref)
      )
    )
    .where(of_npo);
}

async function with_entry(
  tx: DbOrTx,
  row: IOwed,
  kind: IOwedEntry["kind"],
  ref: string
): Promise<IOwedWithEntry> {
  const [entry] = await tx
    .select({ usd: owed_entries.usd })
    .from(owed_entries)
    .where(
      and(
        eq(owed_entries.owed_id, row.id),
        eq(owed_entries.kind, kind),
        eq(owed_entries.ref, ref)
      )
    );
  return { ...row, entry_usd: entry?.usd ?? 0 };
}

export interface IOwedAdminCredit {
  owed_id: string;
  usd: number;
  /** the admin's own words; the entry's `actor` is what marks it an admin's */
  reason: string;
  /** what the credit answers to; a second credit under one ref adds nothing */
  ref: string;
  /** the admin's user id */
  actor: string;
  now: string;
}

/** null when the row does not exist */
export async function admin_credit_owed(
  tx: DbOrTx,
  c: IOwedAdminCredit
): Promise<IOwed | null> {
  return put_entry(
    tx,
    "credit",
    eq(owed_amounts.id, c.owed_id),
    c,
    sql`${finite(c.usd, "admin_credit_owed usd")}::numeric`
  );
}

export interface IOwedWriteOff {
  owed_id: string;
  reason: string;
  /** the admin's user id */
  actor: string;
  now: string;
}

/** writes off all the row still owes and books it as a loss, once per row: a
 * second call adds nothing. null when the row owes nothing and was never
 * written off */
export async function write_off_owed(
  tx: DbOrTx,
  w: IOwedWriteOff
): Promise<IOwed | null> {
  const row = await put_entry(
    tx,
    "write_off",
    eq(owed_amounts.id, w.owed_id),
    { ...w, ref: w.owed_id },
    sql`${owed_amounts.outstanding_usd}`
  );
  if (!row || row.written_off_usd === 0) return null;
  await book_write_off_loss(tx, w.owed_id);
  return row;
}

/** the row's write-off entry as a loss log, keyed by the row so a retry books
 * nothing */
async function book_write_off_loss(tx: DbOrTx, owed_id: string) {
  await tx
    .insert(loss_logs)
    .select(
      tx
        // drizzle's insert-select wants every column, in table order
        .select({
          id: sql<string>`'write_off:' || ${owed_amounts.id}`.as("id"),
          date: owed_entries.at,
          donation_id: owed_amounts.donation_id,
          dist_id: sql<string | null>`null`.as("dist_id"),
          npo_id: owed_amounts.npo_id,
          referrer_user: owed_amounts.referrer_user,
          referrer_npo: owed_amounts.referrer_npo,
          type: sql<"write_off">`'write_off'`.as("type"),
          amount: owed_entries.usd,
          npo_amount:
            sql<number>`CASE WHEN ${owed_amounts.npo_id} IS NULL THEN 0 ELSE ${owed_entries.usd} END`.as(
              "npo_amount"
            ),
          fees_bg: sql<number>`0`.as("fees_bg"),
          fees_processing: sql<number>`0`.as("fees_processing"),
          reason: owed_entries.reason,
          actor: owed_entries.actor,
        })
        .from(owed_entries)
        .innerJoin(owed_amounts, eq(owed_amounts.id, owed_entries.owed_id))
        .where(
          and(
            eq(owed_entries.owed_id, owed_id),
            eq(owed_entries.kind, "write_off"),
            eq(owed_entries.ref, owed_id)
          )
        )
    )
    .onConflictDoNothing({ target: loss_logs.id });
}

type IOwedEntry = typeof owed_entries.$inferSelect;

/** `put_entries` on one row; the row as it stands when no entry went in */
async function put_entry(
  tx: DbOrTx,
  kind: keyof typeof SUM_OF,
  row_is: SQL,
  e: IEntryFields,
  usd: SQL
): Promise<IOwed | null> {
  const [row] = await put_entries(tx, kind, row_is, e, usd);
  if (row) return row;
  const [as_was] = await tx.select().from(owed_amounts).where(row_is);
  return as_was ?? null;
}

/** inserts an entry on each row and adds it to the row's sum in one
 * statement, the rows locked first so a concurrent entry computes `usd`
 * against this one's sum. `usd` is per row, and a row where it is not > 0, or
 * that already has an entry of `kind` under the ref, gets none and is not
 * returned */
async function put_entries(
  tx: DbOrTx,
  kind: keyof typeof SUM_OF,
  row_is: SQL,
  e: IEntryFields,
  usd: SQL
): Promise<IOwed[]> {
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
            actor: sql<string | null>`${e.actor ?? null}`.as("actor"),
          })
          .from(owed_amounts)
          .where(and(row_is, sql`${usd} > 0`))
          .for("update")
      )
      .onConflictDoNothing({
        target: [owed_entries.owed_id, owed_entries.kind, owed_entries.ref],
      })
      .returning({ owed_id: owed_entries.owed_id, usd: owed_entries.usd })
  );
  return tx
    .with(entry)
    .update(owed_amounts)
    .set(SUM_OF[kind](sql`${entry.usd}`, e))
    .from(entry)
    .where(eq(owed_amounts.id, entry.owed_id))
    .returning(getTableColumns(owed_amounts));
}

interface IEntryFields {
  reason: string;
  ref: string;
  now: string;
  actor?: string;
}

const SUM_OF = {
  credit: (usd: SQL, e: IEntryFields) => ({
    credited_back_usd: sql`${owed_amounts.credited_back_usd} + ${usd}`,
    credited_back_at: e.now,
  }),
  recover: (usd: SQL, e: IEntryFields) => ({
    recovered_usd: sql`${owed_amounts.recovered_usd} + ${usd}`,
    recovered_at: e.now,
  }),
  // recovered_at stays the last recovery's; the entry dates the repayment
  repay: (usd: SQL) => ({
    recovered_usd: sql`${owed_amounts.recovered_usd} - ${usd}`,
  }),
  // a row is written off once, so its reason and admin are that entry's
  write_off: (usd: SQL, e: IEntryFields) => ({
    written_off_usd: sql`${owed_amounts.written_off_usd} + ${usd}`,
    written_off_at: e.now,
    write_off_reason: e.reason,
    written_off_by: e.actor,
  }),
};

const PARTY_KEY = [
  owed_amounts.donation_id,
  owed_amounts.npo_id,
  owed_amounts.referrer_user,
  owed_amounts.referrer_npo,
];

const party_row = (e: { donation_id: string; party: OwedParty }) =>
  sql`${owed_amounts.donation_id} = ${e.donation_id} AND ${party_is(e.party)}`;

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

export interface IOwedListOptions {
  party?: "npo" | "referrer";
  sort: "date" | "outstanding";
  dir: "asc" | "desc";
  limit?: number;
  /** the `next` of the page before */
  next?: string;
}

export interface IOwedListItem
  extends Pick<
    IOwed,
    | "id"
    | "donation_id"
    | "npo_id"
    | "referrer_user"
    | "referrer_npo"
    | "source"
    | "source_ref"
    | "recorded_at"
    | "received_usd"
    | "fee_processing_usd"
    | "fee_dispute_usd"
    | "credited_back_usd"
    | "recovered_usd"
  > {
  outstanding_usd: number;
  party: "npo" | "referrer";
  /** the npo's name, or the referrer's: a user's or an npo's */
  party_name: string | null;
}

/** rows still owed (> $0), both parties */
export async function owed_list(
  o: IOwedListOptions,
  tx: DbOrTx = db
): Promise<IPage<IOwedListItem>> {
  const limit = o.limit ?? 20;
  const key =
    o.sort === "date" ? owed_amounts.recorded_at : owed_amounts.outstanding_usd;
  const [order, past] =
    o.dir === "asc" ? [asc, sql.raw(">")] : [desc, sql.raw("<")];
  // keyed by row id, so the sort value is read back from the row exactly
  const after_cursor = o.next
    ? sql`(${key}, ${owed_amounts.id}) ${past} (
        SELECT ${key}, ${owed_amounts.id} FROM ${owed_amounts} WHERE ${owed_amounts.id} = ${o.next})`
    : undefined;

  const rows = await tx
    .select({
      id: owed_amounts.id,
      donation_id: owed_amounts.donation_id,
      npo_id: owed_amounts.npo_id,
      referrer_user: owed_amounts.referrer_user,
      referrer_npo: owed_amounts.referrer_npo,
      source: owed_amounts.source,
      source_ref: owed_amounts.source_ref,
      recorded_at: owed_amounts.recorded_at,
      received_usd: owed_amounts.received_usd,
      fee_processing_usd: owed_amounts.fee_processing_usd,
      fee_dispute_usd: owed_amounts.fee_dispute_usd,
      credited_back_usd: owed_amounts.credited_back_usd,
      recovered_usd: owed_amounts.recovered_usd,
      outstanding_usd: sql<number>`${owed_amounts.outstanding_usd}`.mapWith(
        owed_amounts.outstanding_usd
      ),
      party: sql<
        IOwedListItem["party"]
      >`CASE WHEN ${owed_amounts.npo_id} IS NULL THEN 'referrer' ELSE 'npo' END`,
      party_name: sql<string | null>`COALESCE(${npos.name}, ${user.name})`,
    })
    .from(owed_amounts)
    .leftJoin(
      npos,
      or(
        eq(npos.id, owed_amounts.npo_id),
        eq(npos.referral_id, owed_amounts.referrer_npo)
      )
    )
    .leftJoin(user, eq(user.referral_code, owed_amounts.referrer_user))
    .where(
      and(
        sql`${owed_amounts.outstanding_usd} > 0`,
        o.party === "npo"
          ? isNotNull(owed_amounts.npo_id)
          : o.party === "referrer"
            ? isNull(owed_amounts.npo_id)
            : undefined,
        after_cursor
      )
    )
    .orderBy(order(key), order(owed_amounts.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    items,
    next: rows.length > limit ? items[items.length - 1]?.id : undefined,
  };
}

/** the npo's rows owed (> 0) or due back (< 0), oldest gift first, each held
 * locked until `tx` ends: a refund or credit landing on one waits for it */
export async function outstanding_for_npo(
  tx: DbOrTx,
  npo_id: number
): Promise<IOwed[]> {
  return tx
    .select(getTableColumns(owed_amounts))
    .from(owed_amounts)
    .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
    .where(
      and(
        eq(owed_amounts.npo_id, npo_id),
        sql`${owed_amounts.outstanding_usd} <> 0`
      )
    )
    .orderBy(asc(donations.created_at), asc(owed_amounts.id))
    .for("update", { of: owed_amounts });
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
