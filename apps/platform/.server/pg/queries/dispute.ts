import { asc, eq } from "drizzle-orm";
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

/** the dispute's status as it stands, a close recorded first standing; the
 * row held locked until `tx` ends, so a close of it waits */
export async function dispute_open(
  tx: DbOrTx,
  d: IDisputeOpen
): Promise<IDispute["status"]> {
  await tx
    .insert(donation_disputes)
    .values({ ...d, status: "open" })
    .onConflictDoNothing({ target: donation_disputes.id });
  const [row] = await tx
    .select({ status: donation_disputes.status })
    .from(donation_disputes)
    .where(eq(donation_disputes.id, d.id))
    .for("update");
  return row!.status;
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

export async function disputes_of_donation(
  donation_id: string,
  tx: DbOrTx = db
): Promise<IDispute[]> {
  return tx
    .select()
    .from(donation_disputes)
    .where(eq(donation_disputes.donation_id, donation_id))
    .orderBy(asc(donation_disputes.opened_at));
}
