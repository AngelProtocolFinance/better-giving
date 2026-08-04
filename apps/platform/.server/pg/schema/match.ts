import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamptz, timestamptz_now } from "./columns";
import { donations } from "./donation";

/**
 * one row per donation that entered the match workflow.
 *
 * there is no state column: a stage *is* the presence of its stamp. reading
 * "where did this get to" means asking which timestamps are non-null, and every
 * send-once gate is an update that requires its own stamp to still be null —
 * which is what makes the queue handler idempotent under retry.
 *
 * a donation with no row here is not an error. "no employer given", or an
 * employer name that normalizes to nothing, legitimately produces no row.
 */
export const donation_match_events = pgTable(
  "donation_match_events",
  {
    id: text("id").primaryKey(),
    donation_id: text("donation_id")
      .notNull()
      .references(() => donations.id, { onDelete: "cascade" }),
    // load-bearing for the chase: it fires off this, not off `created_at`
    pack_sent_at: timestamptz("pack_sent_at"),
    chased_at: timestamptz("chased_at"),
    // the donor said they filed it. self-reported, never confirmed by an employer
    submitted_at: timestamptz("submitted_at"),
    // the mail that never left. the stamps above are burnt *before* the send, on
    // purpose — that ordering is what stops two concurrent deliveries both
    // mailing a donor — so a provider refusal costs the donor that mail and no
    // retry gets it back. the stamp above still reads as sent; this pair is the
    // only thing that says otherwise, and is what makes the loss queryable
    // instead of silent.
    send_failed_at: timestamptz("send_failed_at"),
    // which mail was lost. a triage signal, not an audit log: last failure wins,
    // and a row whose next send succeeds keeps the old stamp — so it answers
    // "a mail was lost here", never "this event is broken now".
    send_failed_kind: text("send_failed_kind").$type<"pack" | "chase">(),
    // the *employer's* gift, not the donor's. `donation_id` above is the
    // original donation this event was opened for and never changes; this is a
    // second, born-settled donation row written when the employer's cheque
    // lands. reading one for the other inverts the whole workflow — the event
    // hangs off the gift that earned the match, and points at the match.
    matched_donation_id: text("matched_donation_id").references(
      () => donations.id,
      { onDelete: "cascade" }
    ),
    // when the employer's money landed. the terminal stage: the donor filed, an
    // employer paid, and this is the only stamp in the table backed by money
    // rather than by a mail we sent or a claim the donor made.
    matched_at: timestamptz("matched_at"),
    // the donation went back to the donor, so nothing further is owed here:
    // no chase, no pack. every downstream gate reads this, not `void_reason`.
    voided_at: timestamptz("voided_at"),
    // why the money went back. the donation's own two terminal refund statuses,
    // mirrored, so a refund that realized a loss stays distinguishable from a
    // clean one without re-reading the donation row.
    void_reason: text("void_reason").$type<"refunded" | "refunded_loss">(),
    created_at: timestamptz_now("created_at"),
    updated_at: timestamptz_now("updated_at"),
  },
  (t) => [
    check(
      "donation_match_events_send_failed_kind_check",
      sql`${t.send_failed_kind} IS NULL OR ${t.send_failed_kind} IN ('pack','chase')`
    ),
    // both or neither. a bare timestamp cannot be triaged — nothing says which
    // copy the donor is still owed — and a bare kind cannot be aged out of a
    // window, so either half alone is a row nobody can act on.
    check(
      "donation_match_events_send_failed_pair_check",
      sql`(${t.send_failed_at} IS NULL) = (${t.send_failed_kind} IS NULL)`
    ),
    // both or neither, as above. a bare timestamp claims money arrived with
    // nothing to audit it against, and a bare donation id is a match nobody can
    // date — and `matched_at` is what every read of this stage gates on, so the
    // id alone would be invisible.
    check(
      "donation_match_events_matched_pair_check",
      sql`(${t.matched_at} IS NULL) = (${t.matched_donation_id} IS NULL)`
    ),
    check(
      "donation_match_events_void_reason_check",
      sql`${t.void_reason} IS NULL OR ${t.void_reason} IN ('refunded','refunded_loss')`
    ),
    // both or neither, for the same reason as the pair above: a bare timestamp
    // cannot say which refund it followed, and a bare reason suppresses
    // nothing — the gates all read `voided_at`.
    check(
      "donation_match_events_void_pair_check",
      sql`(${t.voided_at} IS NULL) = (${t.void_reason} IS NULL)`
    ),
    // one event per donation — this is the idempotency key, not just a lookup.
    // the workflow is entered from a retryable queue handler, so the insert
    // races itself; the unique index is what makes the second attempt a no-op
    // instead of a second pack in the donor's inbox.
    uniqueIndex("donation_match_events_donation_id_idx").on(t.donation_id),
  ]
);

export type MatchEvent = typeof donation_match_events.$inferSelect;
