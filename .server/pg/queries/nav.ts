import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  IComposition,
  ILog,
  INpoSeriesOpts,
  IPageOptions,
  ISeries,
} from "@/nav";
import type { IRebalanceLog } from "@/nav/schemas";
import { tickers } from "@/nav/schemas";
import { db } from "../db";
import {
  dividend_logs,
  rebalance_log_bals,
  rebalance_log_txs,
  rebalance_logs,
} from "../schema/liquid";
import { nav_holders, nav_log_positions, nav_logs } from "../schema/nav";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

// -- nav log --

type NavLogBase = {
  date: string;
  reason: string;
  units: number;
  price: number;
  price_updated: string | null;
};

// batched lookup: build composition + value per parent date from nav_log_positions.
async function attach_positions(
  conn: DbOrTx,
  rows: NavLogBase[]
): Promise<ILog[]> {
  if (!rows.length) return [];
  const dates = rows.map((r) => r.date);
  const positions = await conn
    .select()
    .from(nav_log_positions)
    .where(inArray(nav_log_positions.date, dates));

  const comp_by_date = new Map<string, IComposition>();
  const value_by_date = new Map<string, number>();
  for (const p of positions) {
    const d = String(p.date);
    let comp = comp_by_date.get(d);
    if (!comp) {
      comp = {} as IComposition;
      comp_by_date.set(d, comp);
    }
    comp[p.ticker] = {
      id: p.ticker,
      qty: p.qty,
      price: p.price,
      value: p.value,
      price_date: String(p.price_date),
    };
    value_by_date.set(d, (value_by_date.get(d) ?? 0) + p.value);
  }

  return rows.map((r) => ({
    reason: r.reason,
    date: r.date,
    units: r.units,
    price: r.price,
    price_updated: r.price_updated ?? r.date,
    composition: comp_by_date.get(r.date) ?? ({} as IComposition),
    value: value_by_date.get(r.date) ?? 0,
    holders: {},
  }));
}

export async function nav_log_list(opts?: IPageOptions): Promise<IPage<ILog>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({
      date: nav_logs.date,
      reason: nav_logs.reason,
      units: nav_logs.units,
      price: nav_logs.price,
      price_updated: nav_logs.price_updated,
    })
    .from(nav_logs)
    .where(cursor ? sql`${nav_logs.date} < ${cursor}` : undefined)
    .orderBy(desc(nav_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = await attach_positions(db, rows.slice(0, limit));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}

function nav_log_init(): ILog {
  const now = new Date().toISOString();
  const composition = tickers.reduce((acc, t) => {
    acc[t] = { id: t, qty: 0, price_date: now, price: 0, value: 0 };
    return acc;
  }, {} as IComposition);
  return {
    reason: "init",
    date: now,
    composition,
    price: 1,
    price_updated: now,
    value: 0,
    units: 0,
    holders: {},
  };
}

/** latest nav log — used as current NAV state */
export async function nav_ltd(conn: DbOrTx = db): Promise<ILog> {
  const [row] = await conn
    .select({
      date: nav_logs.date,
      reason: nav_logs.reason,
      units: nav_logs.units,
      price: nav_logs.price,
      price_updated: nav_logs.price_updated,
    })
    .from(nav_logs)
    .orderBy(desc(nav_logs.date))
    .limit(1);
  if (!row) return nav_log_init();

  const [log] = await attach_positions(conn, [row]);

  // reconstruct holders from nav_holders
  const holders_rows = await conn
    .select()
    .from(nav_holders)
    .where(eq(nav_holders.date, row.date));
  const holders: Record<number, number> = {};
  for (const h of holders_rows) {
    holders[h.npo_id] = h.units ?? 0;
  }

  return { ...log, holders };
}

export async function nav_week_series(
  opts?: IPageOptions
): Promise<IPage<ILog>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({
      date: nav_logs.date,
      reason: nav_logs.reason,
      units: nav_logs.units,
      price: nav_logs.price,
      price_updated: nav_logs.price_updated,
    })
    .from(nav_logs)
    .where(
      sql`${nav_logs.is_week} = true${cursor ? sql` AND ${nav_logs.date} < ${cursor}` : sql``}`
    )
    .orderBy(desc(nav_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = await attach_positions(db, rows.slice(0, limit));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}

export async function nav_day_series(
  opts?: IPageOptions
): Promise<IPage<ILog>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({
      date: nav_logs.date,
      reason: nav_logs.reason,
      units: nav_logs.units,
      price: nav_logs.price,
      price_updated: nav_logs.price_updated,
    })
    .from(nav_logs)
    .where(
      sql`${nav_logs.is_day} = true${cursor ? sql` AND ${nav_logs.date} < ${cursor}` : sql``}`
    )
    .orderBy(desc(nav_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = await attach_positions(db, rows.slice(0, limit));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}

interface IHolderDelta {
  npo_id: number;
  units_delta: number;
}

export interface INavLogAppendOpts {
  reason: string;
  date: string;
  cash_delta?: number;
  holder_deltas: IHolderDelta[];
  series?: ISeries;
}

// tolerant of IEEE 754 round-trip drift on (amount/price)*price; still catches
// genuine wrong-price derivation (e.g. 0.001% drift on $10k = $0.10 ≫ 1e-6).
const PRICE_INVARIANT_EPS = 1e-6;

/**
 * append a new nav_logs row by cloning the prior snapshot and applying deltas.
 *
 * - cash_delta is applied to the CASH position (qty + value).
 * - holder_deltas overlay onto cloned holders; npos with no prior row are added.
 * - asserts price-preservation: |cash_delta - Σ units_delta * prev_price| < ε.
 *   guards against callers forgetting to derive units at the current nav price.
 */
export async function nav_log_append(
  db: DbOrTx,
  opts: INavLogAppendOpts
): Promise<void> {
  const { reason, date, cash_delta = 0, holder_deltas, series } = opts;

  const units_delta_total = holder_deltas.reduce(
    (s, h) => s + h.units_delta,
    0
  );

  if (cash_delta === 0 && holder_deltas.length === 0) {
    throw new Error("nav_log_append: no-op event");
  }

  await db.transaction(async (tx) => {
    // prior snapshot (head of nav_logs)
    const [prev] = await tx
      .select({
        date: nav_logs.date,
        units: nav_logs.units,
        price: nav_logs.price,
        price_updated: nav_logs.price_updated,
      })
      .from(nav_logs)
      .orderBy(desc(nav_logs.date))
      .limit(1);
    if (!prev) throw new Error("nav_log_append: no prior snapshot");

    // price invariant: cash_delta ≈ units_delta_total * prev.price
    const drift = Math.abs(cash_delta - units_delta_total * prev.price);
    if (drift > PRICE_INVARIANT_EPS) {
      throw new Error(
        `nav_log_append: price invariant violated (drift=${drift}, cash_delta=${cash_delta}, units_delta_total=${units_delta_total}, prev_price=${prev.price})`
      );
    }

    // 1) parent: clone units+price, apply units delta
    await tx.insert(nav_logs).values({
      date,
      reason,
      units: prev.units + units_delta_total,
      price: prev.price,
      price_updated: prev.price_updated ?? undefined,
      is_week: series?.week ?? false,
      is_day: series?.day ?? false,
    });

    // 2) positions: clone prev date; overlay CASH delta. value recomputed in numeric.
    await tx.execute(sql`
      insert into ${nav_log_positions} (date, ticker, qty, price, value, price_date)
      select
        ${date}::timestamptz,
        ticker,
        case when ticker = 'CASH' then qty + ${cash_delta}::numeric(38,18) else qty end,
        price,
        (case when ticker = 'CASH' then qty + ${cash_delta}::numeric(38,18) else qty end * price)::numeric(38,18),
        price_date
      from ${nav_log_positions}
      where date = ${prev.date}
    `);

    // 3) holders: clone prev, overlay deltas; union-all new npos with no prior row.
    if (holder_deltas.length === 0) {
      await tx.execute(sql`
        insert into ${nav_holders} (date, npo_id, units)
        select ${date}::timestamptz, npo_id, units
        from ${nav_holders}
        where date = ${prev.date}
      `);
    } else {
      const values_sql = sql.join(
        holder_deltas.map(
          (h) => sql`(${h.npo_id}::int, ${h.units_delta}::numeric(38,18))`
        ),
        sql`, `
      );
      await tx.execute(sql`
        with deltas(npo_id, units_delta) as (values ${values_sql})
        insert into ${nav_holders} (date, npo_id, units)
        select ${date}::timestamptz, h.npo_id, h.units + coalesce(d.units_delta, 0)
        from ${nav_holders} h
        left join deltas d on d.npo_id = h.npo_id
        where h.date = ${prev.date}
        union all
        select ${date}::timestamptz, d.npo_id, d.units_delta
        from deltas d
        where not exists (
          select 1 from ${nav_holders} h2
          where h2.date = ${prev.date} and h2.npo_id = d.npo_id
        )
      `);
    }
  });
}

export async function nav_log_put(db: DbOrTx, data: ILog, series?: ISeries) {
  // parent without positions would trip the deferred ≥1-child trigger.
  const positions = Object.values(data.composition || {});
  if (!positions.length) return;

  await db.transaction(async (tx) => {
    await tx.insert(nav_logs).values({
      date: data.date,
      reason: data.reason,
      units: data.units,
      price: data.price,
      price_updated: data.price_updated || undefined,
      is_week: series?.week ?? false,
      is_day: series?.day ?? false,
    });

    // value computed by pg numeric (not js float) so value = qty * price check holds.
    await tx.insert(nav_log_positions).values(
      positions.map((p) => ({
        date: data.date,
        ticker: p.id,
        qty: p.qty,
        price: p.price,
        value: sql`(${String(p.qty)}::numeric(38,18) * ${String(p.price)}::numeric(38,18))::numeric(38, 18)`,
        price_date: p.price_date,
      }))
    );

    const holder_entries = Object.entries(data.holders || {});
    if (holder_entries.length) {
      await tx.insert(nav_holders).values(
        holder_entries.map(([npo_id, units]) => ({
          date: data.date,
          npo_id: Number(npo_id),
          units,
        }))
      );
    }
  });
}

/** historical series for a specific npo */
export async function npo_series(id: number, opts?: INpoSeriesOpts) {
  const { range: r = "quarter" } = opts ?? {};
  const limit =
    r === "week" ? 7 : r === "month" ? 30 : r === "quarter" ? 13 : 52;

  const series_page =
    r === "week" || r === "month"
      ? await nav_day_series({ limit })
      : await nav_week_series({ limit });

  // for each nav log, look up this npo's units from nav_holders
  const dates = series_page.items.map((i) => i.date);
  const holder_rows =
    dates.length > 0
      ? await db
          .select()
          .from(nav_holders)
          .where(
            and(eq(nav_holders.npo_id, id), inArray(nav_holders.date, dates))
          )
      : [];

  const units_by_date = new Map(
    holder_rows.map((h) => [h.date!, h.units ?? 0])
  );

  return series_page.items.toReversed().map((i) => {
    const d = String(i.date);
    const units = units_by_date.get(d) || 0;
    const price = i.price;
    return { date: d, price, units, value: units * price };
  });
}

// -- rebalance log --

export async function rebalance_log_put(db: DbOrTx, data: IRebalanceLog) {
  // parent without txs would trip the deferred ≥1-child trigger.
  if (!data.txs.length) return;

  await db.transaction(async (tx) => {
    await tx.insert(rebalance_logs).values({ id: data.id, date: data.date });

    await tx.insert(rebalance_log_txs).values(
      data.txs.map((t) => ({
        rebalance_log_id: data.id,
        tx_id: t.tx_id,
        in_id: t.in_id,
        out_id: t.out_id,
        in_qty: +t.in_qty,
        out_qty: +t.out_qty,
        price: +t.price,
        fee: +t.fee,
      }))
    );

    const bal_entries = Object.entries(data.bals);
    if (bal_entries.length) {
      await tx.insert(rebalance_log_bals).values(
        bal_entries.map(([ticker, balance]) => ({
          rebalance_log_id: data.id,
          ticker,
          balance,
        }))
      );
    }
  });
}

// -- dividend log --

export async function dividend_log_put(
  db: DbOrTx,
  data: typeof dividend_logs.$inferInsert
) {
  await db.insert(dividend_logs).values(data);
}
