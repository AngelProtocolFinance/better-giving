import { and, desc, eq, sql } from "drizzle-orm";
import type {
  IBalanceTx,
  IBalanceTxsPageOptions,
  TAccount,
  TStatus,
} from "@/balance-txs";
import { db } from "../db";
import { bal_txs } from "../schema/bal-tx";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

export async function bal_tx_get(id: string): Promise<IBalanceTx | undefined> {
  const [row] = await db.select().from(bal_txs).where(eq(bal_txs.id, id));
  return row;
}

export async function bal_tx_put(db: DbOrTx, data: IBalanceTx) {
  await db.insert(bal_txs).values(data);
}

export async function bal_tx_update_status(
  db: DbOrTx,
  id: string,
  status: TStatus
) {
  await db
    .update(bal_txs)
    .set({ status, date_updated: new Date().toISOString() })
    .where(eq(bal_txs.id, id));
}

/** paginated by npo + account, ordered by date_created DESC */
export async function bal_tx_npo_txs(
  npo_id: number,
  account: TAccount,
  opts?: { limit?: number; next?: string }
): Promise<IPage<IBalanceTx>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(bal_txs)
    .where(
      and(
        eq(bal_txs.npo_id, npo_id),
        eq(bal_txs.account, account),
        cursor ? sql`${bal_txs.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(bal_txs.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created)
      : undefined,
  };
}

/** paginated by account + status, ordered by date_created DESC */
export async function bal_txs_list({
  limit = 10,
  next,
  status = "pending",
  acc = "lock",
  outflow_only,
}: IBalanceTxsPageOptions = {}): Promise<IPage<IBalanceTx>> {
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(bal_txs)
    .where(
      and(
        eq(bal_txs.account, acc),
        eq(bal_txs.status, status),
        outflow_only
          ? sql`${bal_txs.bal_end} < ${bal_txs.bal_begin}`
          : undefined,
        cursor ? sql`${bal_txs.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(bal_txs.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created)
      : undefined,
  };
}
