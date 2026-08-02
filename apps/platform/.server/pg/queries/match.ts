import { and, eq, isNull } from "drizzle-orm";
import { db as _db } from "../db";
import { donation_match_events, type MatchEvent } from "../schema/match";
import type { DbOrTx } from "./helpers";

/**
 * open the match event for a donation, or hand back the one already there.
 *
 * the unique index on `donation_id` is the idempotency key, not just a lookup:
 * the workflow is entered from a retryable queue handler, so this insert races
 * itself. `onConflictDoNothing` turns the loser into a read of the winner's
 * row, which is what makes a redelivered message a no-op instead of a second
 * event — and, downstream, a second filing pack in the donor's inbox.
 *
 * opening is unconditional on purpose. a voided donation is suppressed at the
 * *send* gate below, not here, so the row stays available to the funnel counts
 * a later commit reads.
 */
export async function open_match_event(
  donation_id: string,
  db: DbOrTx = _db
): Promise<MatchEvent> {
  const [inserted] = await db
    .insert(donation_match_events)
    .values({ id: globalThis.crypto.randomUUID(), donation_id })
    .onConflictDoNothing({ target: donation_match_events.donation_id })
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(donation_match_events)
    .where(eq(donation_match_events.donation_id, donation_id))
    .limit(1);

  // losing the insert means a row exists by definition; the only way to get
  // here is the donation being deleted between the two statements, which
  // cascades the winner's row away. throwing re-drives the delivery rather
  // than reporting a success that wrote nothing.
  if (!existing) throw new Error(`match event vanished: ${donation_id}`);
  return existing;
}

/**
 * claim the right to send this donation's filing pack.
 *
 * one UPDATE...WHERE...RETURNING is the whole send-once gate: the stamp is
 * both the guard and the record, so two concurrent deliveries cannot both come
 * back holding it. reading the row and then writing it would leave a window
 * between the two wide enough for the second delivery to mail the donor again.
 *
 * a null return is the ordinary outcome for a redelivery — the claim was lost,
 * the pack already went out — not a failure.
 *
 * suppressing a voided donation is one line here: add
 * `isNull(donation_match_events.voided_at)` to the `and(...)`. the gate is
 * deliberately shaped so that later commit changes nothing else.
 */
export async function claim_pack_send(
  donation_id: string,
  db: DbOrTx = _db
): Promise<MatchEvent | null> {
  const now = new Date().toISOString();
  const [row] = await db
    .update(donation_match_events)
    .set({ pack_sent_at: now, updated_at: now })
    .where(
      and(
        eq(donation_match_events.donation_id, donation_id),
        isNull(donation_match_events.pack_sent_at)
      )
    )
    .returning();

  return row ?? null;
}
