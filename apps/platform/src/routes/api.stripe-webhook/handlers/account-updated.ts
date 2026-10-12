import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { account_mirror } from "@/stripe-connect/readiness";
import { db } from "$/pg/db";
import { npos } from "$/pg/schema/npo";
import { mirror_columns, not_newer_than } from "$/stripe-connect/sync";

/** writes the readiness `ev` carries onto the npo holding its account, unless
 * that npo was synced after the event happened. false when nothing was written:
 * an account no npo holds (a registration's, or one since replaced), or a stale event */
export async function handle_account_updated(
  ev: Stripe.AccountUpdatedEvent
): Promise<boolean> {
  // `account` is set on events from connected accounts; the platform's own
  // account.updated has none, and its id matches no npo
  const acct = ev.account ?? ev.data.object.id;
  const at = new Date(ev.created * 1000).toISOString();
  const written = await db
    .update(npos)
    .set({
      ...mirror_columns(account_mirror(ev.data.object)),
      stripe_synced_at: at,
    })
    .where(
      and(
        eq(npos.stripe_account_id, acct),
        // in the statement, not a prior read: two deliveries race otherwise
        not_newer_than(at)
      )
    )
    .returning({ id: npos.id });
  return written.length > 0;
}
