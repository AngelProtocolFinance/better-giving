import { eq } from "drizzle-orm";
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
   * was taken or owed */
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

/** the dispute's own share of the charge and its fee, as its open recorded
 * what is owed for it */
export async function dispute_record_share(
  tx: DbOrTx,
  id: string,
  s: { share: number; fee_usd: number }
): Promise<void> {
  await tx.update(donation_disputes).set(s).where(eq(donation_disputes.id, id));
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
