import { and, eq, inArray } from "drizzle-orm";
import { owed_amounts, owed_entries } from "../schema/owed";
import type { DbOrTx } from "./helpers";

/** the ref of the credit giving back what a failed refund recorded as
 * received; `refund_failed` keys its card-fee credit beside it */
export const refund_failed_ref = (refund_id: string) =>
  `refund_failed:${refund_id}`;

/** of `refund_ids`, the refunds whose failure was credited back on any of
 * the gift's rows */
export async function refunds_credited_back(
  tx: DbOrTx,
  donation_id: string,
  refund_ids: string[]
): Promise<Set<string>> {
  if (refund_ids.length === 0) return new Set();
  const refs = new Map(refund_ids.map((id) => [refund_failed_ref(id), id]));
  const rows = await tx
    .selectDistinct({ ref: owed_entries.ref })
    .from(owed_entries)
    .innerJoin(owed_amounts, eq(owed_amounts.id, owed_entries.owed_id))
    .where(
      and(
        eq(owed_amounts.donation_id, donation_id),
        eq(owed_entries.kind, "credit"),
        inArray(owed_entries.ref, [...refs.keys()])
      )
    );
  return new Set(rows.map((r) => refs.get(r.ref)!));
}
