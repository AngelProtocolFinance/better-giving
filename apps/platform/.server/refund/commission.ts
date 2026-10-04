import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../pg/queries/helpers";
import { credit_owed } from "../pg/queries/owed";
import { dists } from "../pg/schema/dist";
import { referrer_commissions } from "../pg/schema/referrer";
import { referrer_of } from "./plan";

/**
 * commissions refunded while referrer transfer `ref` held them, whose transfer
 * then went unfunded: their referrer was never paid them, so what each gift's
 * row counts for them is credited back
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
    await credit_owed(tx, {
      donation_id: c.donation_id,
      party: referrer_of(c),
      usd: c.usd,
      reason: "transfer_unfunded",
      ref,
      now,
    });
  }
}
