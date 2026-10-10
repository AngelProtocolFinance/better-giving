import { and, asc, eq } from "drizzle-orm";
import { donation_takes } from "../schema/take";
import type { DbOrTx } from "./helpers";

export type ITake = typeof donation_takes.$inferSelect;

/** the gift's takes, oldest first; read under the gift's dist locks, so no
 * other event on it writes one meanwhile */
export function takes_of(tx: DbOrTx, donation_id: string): Promise<ITake[]> {
  return tx
    .select()
    .from(donation_takes)
    .where(eq(donation_takes.donation_id, donation_id))
    .orderBy(asc(donation_takes.created_at), asc(donation_takes.id));
}

export type ITakeNew = Pick<ITake, "donation_id" | "ref" | "kind" | "share"> &
  Partial<Pick<ITake, "fee_usd" | "dispute_id" | "chargeback_ref" | "status">>;

/** puts the take on record; one already under its ref stays as it is. false
 * when it was */
export async function take_add(tx: DbOrTx, t: ITakeNew): Promise<boolean> {
  const added = await tx
    .insert(donation_takes)
    .values(t)
    .onConflictDoNothing({
      target: [donation_takes.donation_id, donation_takes.ref],
    })
    .returning({ id: donation_takes.id });
  return added.length > 0;
}

export async function take_update(
  tx: DbOrTx,
  id: string,
  set: Partial<
    Pick<
      ITake,
      "ref" | "share" | "fee_usd" | "status" | "dispute_id" | "chargeback_ref"
    >
  >
): Promise<void> {
  await tx.update(donation_takes).set(set).where(eq(donation_takes.id, id));
}

/** a take that no longer counts; false when there was no active one under
 * `ref` */
export async function take_undo(
  tx: DbOrTx,
  donation_id: string,
  ref: string
): Promise<boolean> {
  const undone = await tx
    .update(donation_takes)
    .set({ status: "undone" })
    .where(
      and(
        eq(donation_takes.donation_id, donation_id),
        eq(donation_takes.ref, ref),
        eq(donation_takes.status, "active")
      )
    )
    .returning({ id: donation_takes.id });
  return undone.length > 0;
}
