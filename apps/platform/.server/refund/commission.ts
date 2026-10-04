import { and, eq, inArray, sql } from "drizzle-orm";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import type { DbOrTx } from "../pg/queries/helpers";
import { credit_owed, type IOwed, owed_for_party } from "../pg/queries/owed";
import { dists } from "../pg/schema/dist";
import { referrer_commissions } from "../pg/schema/referrer";
import { referrer_of } from "./plan";

/** where ops credits a referrer row by hand */
export const CREDIT_BY_HAND =
  "credit each on its gift's referrer row on Amounts owed (/platform/owed)";

const creditable = (o: IOwed) =>
  o.received_usd +
  o.fee_processing_usd +
  o.fee_dispute_usd -
  o.credited_back_usd -
  o.written_off_usd;

/**
 * commissions refunded while referrer transfer `ref` held them, whose transfer
 * then went unfunded: their referrer was never paid them, so what each gift's
 * row counts for them is credited back, up to what the row still has to credit
 */
export async function credit_unfunded_commissions(
  tx: DbOrTx,
  ref: string
): Promise<void> {
  const claimed = await tx
    .select({
      donation_id: dists.donation_id,
      referrer_user: referrer_commissions.referrer_user,
      referrer_npo: referrer_commissions.referrer_npo,
      usd: sql<number>`sum(${referrer_commissions.amount})`.mapWith(Number),
    })
    .from(referrer_commissions)
    .innerJoin(dists, eq(dists.id, referrer_commissions.donation_id))
    .where(
      and(
        eq(referrer_commissions.ref, ref),
        eq(referrer_commissions.status, "refunded_loss")
      )
    )
    .groupBy(
      dists.donation_id,
      referrer_commissions.referrer_user,
      referrer_commissions.referrer_npo
    );
  const now = new Date().toISOString();
  for (const c of claimed) {
    const party = referrer_of(c);
    const row = await owed_for_party(c.donation_id, party, tx);
    if (!row) continue;
    const usd = Math.min(c.usd, creditable(row));
    if (usd <= 0) continue;
    await credit_owed(tx, {
      donation_id: c.donation_id,
      party,
      usd,
      reason: "transfer_unfunded",
      ref,
      now,
    });
  }
}

/** one line per commission refunded while a transfer in `refs` held it, with
 * what its referrer's row on the gift has outstanding */
export async function refunded_in_flight_lines(
  refs: string[],
  tx: DbOrTx = db
): Promise<string[]> {
  if (refs.length === 0) return [];
  const rows = await tx
    .select({
      id: referrer_commissions.donation_id,
      amount: referrer_commissions.amount,
      ref: referrer_commissions.ref,
      referrer_user: referrer_commissions.referrer_user,
      referrer_npo: referrer_commissions.referrer_npo,
      donation_id: dists.donation_id,
    })
    .from(referrer_commissions)
    .innerJoin(dists, eq(dists.id, referrer_commissions.donation_id))
    .where(
      and(
        inArray(referrer_commissions.ref, refs),
        eq(referrer_commissions.status, "refunded_loss")
      )
    )
    .orderBy(referrer_commissions.donation_id);
  const lines: string[] = [];
  for (const r of rows) {
    const party = referrer_of(r);
    const owed = await owed_for_party(r.donation_id, party, tx);
    const who =
      "referrer_user" in party ? party.referrer_user : party.referrer_npo;
    const standing = owed
      ? `has $${humanize(owed.outstanding_usd ?? 0)} outstanding`
      : "is not recorded";
    lines.push(
      `commission ${r.id} ($${humanize(r.amount)}, gift ${r.donation_id}, customerTransactionId ${r.ref}): referrer ${who}'s row on the gift ${standing}`
    );
  }
  return lines;
}
