import { and, eq, isNotNull, isNull } from "drizzle-orm";
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

/**
 * claim the donor's "I filed it" for this donation.
 *
 * the same one-statement gate as the pack send, for the same reason: the stamp
 * is the guard and the record at once, so a double-submit — a refresh, a
 * double-click, a retried POST — cannot both come back holding it, and only the
 * winner mails us. this is self-reported and never confirmed by an employer, so
 * the stamp is the only thing that will ever say a claim was filed.
 *
 * a null return is the ordinary outcome for the loser: already filed, not an
 * error.
 *
 * suppressing a voided donation is one line here: add
 * `isNull(donation_match_events.voided_at)` to the `and(...)`.
 */
export async function claim_submitted(
  donation_id: string,
  db: DbOrTx = _db
): Promise<MatchEvent | null> {
  const now = new Date().toISOString();
  const [row] = await db
    .update(donation_match_events)
    .set({ submitted_at: now, updated_at: now })
    .where(
      and(
        eq(donation_match_events.donation_id, donation_id),
        isNull(donation_match_events.submitted_at)
      )
    )
    .returning();

  return row ?? null;
}

/**
 * claim the right to send this donation's one reminder to file.
 *
 * every condition the chase depends on is asserted here rather than read first
 * and checked after, because three days pass between arming the message and its
 * delivery and any of them can turn over in that window: the pack must actually
 * have gone out (`pack_sent_at`), the donor must not already have told us they
 * filed (`submitted_at` — the suppression this whole message exists to respect),
 * and no earlier delivery may have chased them (`chased_at`, which is the
 * send-once gate). one statement, so none of them can change between the check
 * and the write.
 *
 * a null return is the ordinary outcome, not a failure: it is what "no chase is
 * owed" looks like, whichever of the three said so.
 *
 * suppressing a voided donation is one line here: add
 * `isNull(donation_match_events.voided_at)` to the `and(...)`.
 */
export async function claim_match_chase(
  donation_id: string,
  db: DbOrTx = _db
): Promise<MatchEvent | null> {
  const now = new Date().toISOString();
  const [row] = await db
    .update(donation_match_events)
    .set({ chased_at: now, updated_at: now })
    .where(
      and(
        eq(donation_match_events.donation_id, donation_id),
        isNotNull(donation_match_events.pack_sent_at),
        isNull(donation_match_events.chased_at),
        isNull(donation_match_events.submitted_at)
      )
    )
    .returning();

  return row ?? null;
}

/**
 * record that a mail was handed to the provider and refused.
 *
 * the counterpart to the claims above, and deliberately not one of them: there
 * is nothing to win here. the stamp was burnt before the mail was handed over,
 * the provider refused, and at-most-once means no retry is coming — so this
 * update asserts nothing beyond the donation and cannot lose a race. rolling
 * the stamp back instead would reopen the double-send window every claim in
 * this module is shaped to keep closed.
 *
 * a triage signal, not an audit log. one stamp per row, last failure winning,
 * so it answers "did this event lose a mail", never "is one owed now".
 */
export async function mark_match_send_failed(
  donation_id: string,
  kind: "pack" | "chase",
  db: DbOrTx = _db
): Promise<MatchEvent | null> {
  const now = new Date().toISOString();
  const [row] = await db
    .update(donation_match_events)
    .set({ send_failed_at: now, send_failed_kind: kind, updated_at: now })
    .where(eq(donation_match_events.donation_id, donation_id))
    .returning();

  return row ?? null;
}

/**
 * stamp an event void — the donation went back to the donor, so nothing
 * further is owed on it.
 *
 * a donation that never entered the workflow has no row to stamp and returns
 * null, which is not an error: most donations have no event at all.
 *
 * takes the handle first and undefaulted, unlike every function above it. the
 * only caller runs inside the refund's transaction, and a defaulted parameter
 * is precisely how such a write silently escapes the transaction it was meant
 * to be atomic with — the mistake would type-check.
 *
 * `voided_at IS NULL` is the idempotency gate. a replayed `charge.refunded`
 * re-enters this write, and without the guard the stamp would jump forward to
 * the replay's clock, losing when the donation was actually reversed — the one
 * thing the timestamp is there to say. the no-op returns null.
 */
export async function void_match_event(
  db: DbOrTx,
  donation_id: string,
  reason: "refunded" | "refunded_loss"
): Promise<MatchEvent | null> {
  const now = new Date().toISOString();
  const [row] = await db
    .update(donation_match_events)
    .set({ voided_at: now, void_reason: reason, updated_at: now })
    .where(
      and(
        eq(donation_match_events.donation_id, donation_id),
        isNull(donation_match_events.voided_at)
      )
    )
    .returning();

  return row ?? null;
}

/** the event row for a donation, if the workflow was ever entered for it */
export async function match_event_get(
  donation_id: string,
  db: DbOrTx = _db
): Promise<MatchEvent | null> {
  const [row] = await db
    .select()
    .from(donation_match_events)
    .where(eq(donation_match_events.donation_id, donation_id))
    .limit(1);

  return row ?? null;
}
