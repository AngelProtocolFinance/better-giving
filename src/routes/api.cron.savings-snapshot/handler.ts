import { db } from "$/pg/db";
import { bal_log_put } from "$/pg/queries/liquid";
import { npo_all_liq } from "$/pg/queries/npo";
export async function index() {
  const now = new Date().toISOString();

  const all = await npo_all_liq();
  const non_zero = all.filter((x) => x.liq > 0);

  const npo_bals = non_zero.reduce(
    (acc, cur) => {
      acc[cur.id] = cur.liq;
      return acc;
    },
    {} as Record<string, number>
  );

  await bal_log_put(db, {
    date: now,
    balances: npo_bals,
  });
  console.info(`Logged ${non_zero.length} non-zero balances`);
  return { statusCode: 200 };
}
