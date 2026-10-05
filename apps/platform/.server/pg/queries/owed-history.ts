import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { payout_total } from "../../payouts/transfer";
import { db } from "../db";
import { donations } from "../schema/donation";
import { owed_amounts, owed_entries } from "../schema/owed";
import { payouts, settlements } from "../schema/payout";
import type { DbOrTx } from "./helpers";
import {
  type IOwed,
  type OwedParty,
  owed_reaches_party,
  party_is,
} from "./owed";

/** precedence runs top down: a row partly recovered, then written off, is waived */
export type OwedState =
  | "waived"
  | "credited_back"
  | "recovered"
  | "partly_recovered"
  | "recorded";

/** what one run moved on the row */
export interface IOwedRunLine {
  run_ref: string;
  reason: "grant_run" | "commission_run";
  /** the grant run's settlement, which its payouts' `settled_id` names; null
   * for a commission run, or a grant run whose transfer is still in flight */
  settlement_id: string | null;
  /** negative: a due-back the run paid to the party */
  usd: number;
  at: string;
}

export interface IOwedHistoryRow
  extends Pick<
    IOwed,
    | "id"
    | "source"
    | "recorded_at"
    | "received_usd"
    | "fee_processing_usd"
    | "fee_dispute_usd"
    | "recovered_usd"
    | "credited_back_usd"
    | "credited_back_at"
    | "written_off_usd"
    | "written_off_at"
  > {
  /** the gift's reference, the transaction id its receipt and npo notice
   * carry; the history names no donor */
  donation_id: string;
  gift_date: string;
  /** in `gift_currency`, before tip and fee allowance */
  gift_amount: number;
  gift_currency: string;
  state: OwedState;
  /** negative: the party is due that much back */
  outstanding_usd: number;
  /** oldest first; a run whose transfer went unfunded is left out, its
   * recovery having been undone */
  recoveries: IOwedRunLine[];
}

const state = sql<OwedState>`CASE
  WHEN ${owed_amounts.written_off_usd} > 0 THEN 'waived'
  WHEN ${owed_amounts.credited_back_usd} > 0 THEN 'credited_back'
  WHEN ${owed_amounts.recovered_usd} > 0 AND ${owed_amounts.outstanding_usd} < 0.01 THEN 'recovered'
  WHEN ${owed_amounts.recovered_usd} > 0 THEN 'partly_recovered'
  ELSE 'recorded' END`;

/** a recovery as is; a due-back payment, which the run added, negative */
const signed_usd =
  sql<number>`CASE WHEN ${owed_entries.kind} = 'repay' THEN -${owed_entries.usd} ELSE ${owed_entries.usd} END`.mapWith(
    owed_entries.usd
  );

/** the npo's rows that reach it, latest recorded first */
export function npo_owed_history(
  npo_id: number,
  tx: DbOrTx = db
): Promise<IOwedHistoryRow[]> {
  return owed_history({ npo_id }, tx);
}

/** the referrer's own rows that reach it, latest recorded first; an `NPO-`
 * referrer never sees the rows it owes as a gift's npo */
export function referrer_owed_history(
  referrer: Exclude<OwedParty, { npo_id: number }>,
  tx: DbOrTx = db
): Promise<IOwedHistoryRow[]> {
  return owed_history(referrer, tx);
}

/** one row as its history line has it, whether or not it reaches its party:
 * its notice was queued only if it did */
export async function owed_history_row(
  owed_id: string,
  tx: DbOrTx = db
): Promise<IOwedHistoryRow | undefined> {
  const [row] = await history_of(tx, eq(owed_amounts.id, owed_id));
  return row;
}

function owed_history(
  party: OwedParty,
  tx: DbOrTx
): Promise<IOwedHistoryRow[]> {
  return history_of(tx, and(party_is(party), owed_reaches_party())!);
}

async function history_of(tx: DbOrTx, where: SQL): Promise<IOwedHistoryRow[]> {
  const rows = await tx
    .select({
      id: owed_amounts.id,
      donation_id: owed_amounts.donation_id,
      gift_date: donations.created_at,
      gift_amount: donations.amount_base,
      gift_currency: donations.currency,
      source: owed_amounts.source,
      recorded_at: owed_amounts.recorded_at,
      state,
      received_usd: owed_amounts.received_usd,
      fee_processing_usd: owed_amounts.fee_processing_usd,
      fee_dispute_usd: owed_amounts.fee_dispute_usd,
      recovered_usd: owed_amounts.recovered_usd,
      credited_back_usd: owed_amounts.credited_back_usd,
      credited_back_at: owed_amounts.credited_back_at,
      written_off_usd: owed_amounts.written_off_usd,
      written_off_at: owed_amounts.written_off_at,
      outstanding_usd: sql<number>`${owed_amounts.outstanding_usd}`.mapWith(
        owed_amounts.outstanding_usd
      ),
    })
    .from(owed_amounts)
    .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
    .where(where)
    .orderBy(desc(owed_amounts.recorded_at), desc(owed_amounts.id));
  const lines = await run_lines(
    tx,
    rows.map((r) => r.id)
  );
  return rows.map((r) => ({ ...r, recoveries: lines.get(r.id) ?? [] }));
}

/** one gift's share of a grant run's deductions */
export interface IGrantRunDeduction {
  owed_id: string;
  donation_id: string;
  gift_date: string;
  gift_amount: number;
  gift_currency: string;
  /** negative: a due-back the run paid to the npo */
  usd: number;
}

export interface IGrantRunDeductions {
  /** the run's payouts, to the cent as the run sent them */
  gross: number;
  net: number;
  /** oldest gift first; they sum to gross less net */
  deductions: IGrantRunDeduction[];
}

/** the grant run behind `settlement_id`, which a payout's `settled_id` names.
 * null when the npo has no such settlement */
export async function grant_run_deductions(
  npo_id: number,
  settlement_id: string,
  tx: DbOrTx = db
): Promise<IGrantRunDeductions | null> {
  const [run] = await tx
    .select({
      // a run that sent a transfer is settled under the transfer's id, its
      // own ref the other id; one that recovered everything, under its ref
      ref: sql<string>`COALESCE(${settlements.other_id}, ${settlements.id})`,
      net: settlements.amount,
    })
    .from(settlements)
    .where(
      and(eq(settlements.id, settlement_id), eq(settlements.npo_id, npo_id))
    );
  if (!run) return null;

  const paid = await tx
    .select({ amount: payouts.amount })
    .from(payouts)
    .where(
      and(eq(payouts.settled_id, settlement_id), eq(payouts.npo_id, npo_id))
    );
  const deductions = await tx
    .select({
      owed_id: owed_amounts.id,
      donation_id: owed_amounts.donation_id,
      gift_date: donations.created_at,
      gift_amount: donations.amount_base,
      gift_currency: donations.currency,
      usd: signed_usd,
    })
    .from(owed_entries)
    .innerJoin(owed_amounts, eq(owed_amounts.id, owed_entries.owed_id))
    .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
    .where(
      and(
        eq(owed_amounts.npo_id, npo_id),
        eq(owed_entries.ref, run.ref),
        inArray(owed_entries.kind, ["recover", "repay"])
      )
    )
    .orderBy(asc(donations.created_at), asc(owed_amounts.donation_id));

  return {
    gross: payout_total(paid.map((p) => p.amount)),
    net: run.net,
    deductions,
  };
}

/** each row's recoveries and due-back payments, an unfunded run's left out:
 * `unrecover_owed` undoes each under `unfunded:<ref>` with the opposite kind */
async function run_lines(
  tx: DbOrTx,
  owed_ids: string[]
): Promise<Map<string, IOwedRunLine[]>> {
  if (owed_ids.length === 0) return new Map();
  const undo = alias(owed_entries, "undo");
  const lines = await tx
    .select({
      owed_id: owed_entries.owed_id,
      run_ref: owed_entries.ref,
      reason: sql<IOwedRunLine["reason"]>`${owed_entries.reason}`,
      settlement_id: settlements.id,
      usd: signed_usd,
      at: owed_entries.at,
    })
    .from(owed_entries)
    .innerJoin(owed_amounts, eq(owed_amounts.id, owed_entries.owed_id))
    .leftJoin(
      undo,
      and(
        eq(undo.owed_id, owed_entries.owed_id),
        sql`${undo.kind} <> ${owed_entries.kind}`,
        eq(undo.ref, sql`'unfunded:' || ${owed_entries.ref}`)
      )
    )
    .leftJoin(
      settlements,
      and(
        eq(settlements.npo_id, owed_amounts.npo_id),
        or(
          eq(settlements.id, owed_entries.ref),
          eq(settlements.other_id, owed_entries.ref)
        )
      )
    )
    .where(
      and(
        inArray(owed_entries.owed_id, owed_ids),
        inArray(owed_entries.kind, ["recover", "repay"]),
        sql`${undo.id} IS NULL`,
        sql`${owed_entries.ref} NOT LIKE 'unfunded:%'`
      )
    )
    .orderBy(asc(owed_entries.at), asc(owed_entries.id));

  const by_row = new Map<string, IOwedRunLine[]>();
  for (const { owed_id, ...line } of lines) {
    by_row.set(owed_id, [...(by_row.get(owed_id) ?? []), line]);
  }
  return by_row;
}
