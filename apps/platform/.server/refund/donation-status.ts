import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../pg/queries/helpers";
import { dists } from "../pg/schema/dist";

/**
 * a reversed donation's status, from its dists' committed refund outcomes. read
 * under the donation's row lock: a loss reversed since its dist was refunded
 * no longer counts.
 */
export async function donation_refund_status(
  tx: DbOrTx,
  donation_id: string
): Promise<"refunded" | "refunded_loss"> {
  const [loss] = await tx
    .select({ id: dists.id })
    .from(dists)
    .where(
      and(eq(dists.donation_id, donation_id), eq(dists.refund_status, "loss"))
    )
    .limit(1);
  return loss ? "refunded_loss" : "refunded";
}
