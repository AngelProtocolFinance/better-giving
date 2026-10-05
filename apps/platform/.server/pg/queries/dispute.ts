import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { donation_disputes } from "../schema/dispute";
import type { DbOrTx } from "./helpers";

export type IDispute = typeof donation_disputes.$inferSelect;

export interface IDisputeOpen {
  /** the provider's dispute id */
  id: string;
  donation_id: string;
  /** when the provider opened it, not when we heard */
  opened_at: string;
}

export interface IDisputeOpened {
  /** as it stands: a close recorded first stands */
  status: IDispute["status"];
  /** this call put the dispute on record; every other call for it, however
   * concurrent, finds it */
  inserted: boolean;
}

/** the row is held locked until `tx` ends, so a close of it waits */
export async function dispute_open(
  tx: DbOrTx,
  d: IDisputeOpen
): Promise<IDisputeOpened> {
  const [added] = await tx
    .insert(donation_disputes)
    .values({ ...d, status: "open" })
    .onConflictDoNothing({ target: donation_disputes.id })
    .returning({ status: donation_disputes.status });
  if (added) return { status: added.status, inserted: true };
  const [row] = await tx
    .select({ status: donation_disputes.status })
    .from(donation_disputes)
    .where(eq(donation_disputes.id, d.id))
    .for("update");
  return { status: row!.status, inserted: false };
}

export interface IDisputeClose extends IDisputeOpen {
  /** `inquiry_closed`: an inquiry that ended with no chargeback, so nothing
   * was taken or owed. `accepted`: the claim was accepted and the buyer paid
   * through a refund, which counts it, so it is not a loss */
  status: Exclude<IDispute["status"], "open">;
  closed_at: string;
}

/** recorded closed whether or not its open was; the first close stands */
export async function dispute_close(
  tx: DbOrTx,
  d: IDisputeClose
): Promise<void> {
  await tx
    .insert(donation_disputes)
    .values(d)
    .onConflictDoUpdate({
      target: donation_disputes.id,
      set: { status: d.status, closed_at: d.closed_at },
      setWhere: eq(donation_disputes.status, "open"),
    });
}

/** the dispute's own share of the charge, the share its open counted taken
 * back, and its fee, as its open recorded what is owed for it */
export async function dispute_record_share(
  tx: DbOrTx,
  id: string,
  s: { share: number; cumulative_share: number; fee_usd: number }
): Promise<void> {
  await tx.update(donation_disputes).set(s).where(eq(donation_disputes.id, id));
}

/** the gift's disputes closed lost, other than `except`, with the share and
 * fee their opens recorded, and whether a chargeback under each recorded its
 * share on the gift */
export async function disputes_lost_of(
  tx: DbOrTx,
  donation_id: string,
  except: string
): Promise<{ share: number; fee_usd: number; loss_recorded: boolean }[]> {
  const rows = await tx
    .select({
      share: donation_disputes.share,
      fee_usd: donation_disputes.fee_usd,
      loss_recorded_at: donation_disputes.loss_recorded_at,
    })
    .from(donation_disputes)
    .where(
      and(
        eq(donation_disputes.donation_id, donation_id),
        eq(donation_disputes.status, "lost"),
        ne(donation_disputes.id, except),
        isNotNull(donation_disputes.share)
      )
    );
  return rows.map((r) => ({
    share: r.share ?? 0,
    fee_usd: r.fee_usd ?? 0,
    loss_recorded: r.loss_recorded_at !== null,
  }));
}

/** a chargeback under dispute `id` recorded its share on the gift. a ref no
 * dispute is on record under yet (a chargeback that came before its dispute's
 * filing) is put on record open, for that filing to claim */
export async function dispute_loss_recorded(
  tx: DbOrTx,
  d: { id: string; donation_id: string; now: string }
): Promise<void> {
  await tx
    .insert(donation_disputes)
    .values({
      id: d.id,
      donation_id: d.donation_id,
      status: "open",
      opened_at: d.now,
      loss_recorded_at: d.now,
    })
    .onConflictDoUpdate({
      target: donation_disputes.id,
      set: { loss_recorded_at: d.now },
      setWhere: and(
        eq(donation_disputes.donation_id, d.donation_id),
        isNull(donation_disputes.loss_recorded_at)
      ),
    });
}

/** claims for dispute `id` a chargeback on the gift recorded before any
 * filing named it: that record is dropped, and the dispute takes over that
 * its chargeback is on record. false when there is none */
export async function dispute_claim_prior_loss(
  tx: DbOrTx,
  d: { id: string; donation_id: string; now: string }
): Promise<boolean> {
  const [prior] = await tx
    .select({ id: donation_disputes.id })
    .from(donation_disputes)
    .where(
      and(
        eq(donation_disputes.donation_id, d.donation_id),
        ne(donation_disputes.id, d.id),
        eq(donation_disputes.status, "open"),
        isNull(donation_disputes.share),
        isNotNull(donation_disputes.loss_recorded_at)
      )
    )
    .orderBy(donation_disputes.opened_at)
    .limit(1)
    .for("update");
  if (!prior) return false;
  await tx.delete(donation_disputes).where(eq(donation_disputes.id, prior.id));
  await tx
    .update(donation_disputes)
    .set({ loss_recorded_at: d.now })
    .where(eq(donation_disputes.id, d.id));
  return true;
}

export async function dispute_get(
  id: string,
  tx: DbOrTx = db
): Promise<IDispute | undefined> {
  const [row] = await tx
    .select()
    .from(donation_disputes)
    .where(eq(donation_disputes.id, id));
  return row;
}
