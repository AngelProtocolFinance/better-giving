import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { nav_log_append } from "./nav";
import { npo_balance_adj, npo_balance_update } from "./npo";

// pglite's drizzle handle differs from neon's only in the result-type HKT
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;
let npo_id: number;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(npos);
  npo_id = (await seed_npo(test_db.db, { liq: 10, lock_units: 5, cash: 3 }))!
    .id;
});

const balances = async () => {
  const [row] = await test_db.db
    .select({ liq: npos.liq, lock_units: npos.lock_units, cash: npos.cash })
    .from(npos)
    .where(eq(npos.id, npo_id));
  return row;
};

// a raw `sql` param skips the column's toDriver, so NaN would reach numeric
describe.each([NaN, Infinity])("a %s balance delta", (bad) => {
  test("is refused by npo_balance_adj and changes nothing", async () => {
    await expect(
      npo_balance_adj(as_db(test_db.db), npo_id, { cash: 1, liq: bad })
    ).rejects.toThrow(/finite/);
    expect(await balances()).toEqual({ liq: 10, lock_units: 5, cash: 3 });
  });

  test("is refused by npo_balance_update and changes nothing", async () => {
    await expect(
      npo_balance_update(
        as_db(test_db.db),
        npo_id,
        { liq: 0, lock_units: bad, cash: 1 },
        "inc"
      )
    ).rejects.toThrow(/finite/);
    expect(await balances()).toEqual({ liq: 10, lock_units: 5, cash: 3 });
  });

  test("is refused by nav_log_append", async () => {
    await expect(
      nav_log_append(as_db(test_db.db), {
        reason: "bad",
        date: new Date().toISOString(),
        cash_delta: bad,
        holder_deltas: [{ npo_id, units_delta: 1 }],
      })
    ).rejects.toThrow(/finite/);
    await expect(
      nav_log_append(as_db(test_db.db), {
        reason: "bad",
        date: new Date().toISOString(),
        cash_delta: 1,
        holder_deltas: [{ npo_id, units_delta: bad }],
      })
    ).rejects.toThrow(/finite/);
  });
});
