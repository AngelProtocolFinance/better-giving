import type { IPayout } from "@/payouts";
import type { payouts } from "../../schema/payout";

type PayoutRow = typeof payouts.$inferSelect;
type PayoutInsert = typeof payouts.$inferInsert;

export function to_payout(row: PayoutRow): IPayout {
  const base = {
    id: row.id,
    source_id: row.source_id,
    npo_id: row.npo_id,
    source: row.source,
    date: row.date,
    amount: row.amount,
  };

  switch (row.type) {
    case "settled":
      return {
        ...base,
        type: "settled",
        settled_date: row.settled_date ?? "",
        settled_id: row.settled_id ?? "",
      };
    case "error":
      return {
        ...base,
        type: "error",
        message: row.message ?? "",
      };
    case "refunded":
      return { ...base, type: "refunded" };
    case "refunded_loss":
      return { ...base, type: "refunded_loss" };
    case "cancelled":
      return { ...base, type: "cancelled" };
    default:
      return { ...base, type: "pending" };
  }
}

export function from_payout_insert(data: IPayout): PayoutInsert {
  return {
    id: data.id,
    source_id: data.source_id,
    npo_id: data.npo_id,
    source: data.source,
    date: data.date,
    amount: data.amount,
    type: data.type,
    message: data.type === "error" ? data.message : null,
    settled_date: data.type === "settled" ? data.settled_date : null,
    settled_id: data.type === "settled" ? data.settled_id : null,
  };
}

export function from_payout_update(
  data: Partial<Omit<IPayout, "id">>
): Partial<Omit<PayoutInsert, "id">> {
  const out: Record<string, unknown> = {};
  if (data.source_id !== undefined) out.source_id = data.source_id;
  if (data.npo_id !== undefined) out.npo_id = data.npo_id;
  if (data.source !== undefined) out.source = data.source;
  if (data.date !== undefined) out.date = data.date;
  if (data.amount !== undefined) out.amount = data.amount;
  if (data.type !== undefined) {
    out.type = data.type;
    if (data.type === "error") {
      out.message = (data as { message?: string }).message ?? null;
    }
    if (data.type === "settled") {
      out.settled_date =
        (data as { settled_date?: string }).settled_date ?? null;
      out.settled_id = (data as { settled_id?: string }).settled_id ?? null;
    }
  }
  return out as Partial<Omit<PayoutInsert, "id">>;
}
