import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo as insert_npo } from "#/__tests__/fixtures/funds";
import { bal_txs } from "$/pg/schema/bal-tx";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

import { admin_ctx } from "#/.server/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { transfer_action } from "./transfer-action";

const db = () => test_db.current!.db;
const action = transfer_action({ liq: "/savings", lock: "/investments" });

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(nav_holders);
  await db().delete(nav_log_positions);
  await db().delete(nav_logs);
  await db().delete(bal_txs);
  await db().delete(npos);
});

/** an npo with `liq` in savings and nothing invested, in a fund priced at $10/unit */
async function seed_npo(liq: number) {
  const npo = await insert_npo(db(), {
    registration_number: "EIN-TRANSFER",
    liq,
    lock_units: 0,
  });
  const date = "2026-01-01T00:00:00.000Z";
  // nav_logs' deferred trigger wants its positions in the same transaction
  await db().transaction(async (pg) => {
    await pg.insert(nav_logs).values({
      date,
      reason: "seed",
      units: 100,
      price: 10,
      price_updated: date,
    });
    await pg.insert(nav_log_positions).values({
      date,
      ticker: "CASH",
      qty: 1000,
      price: 1,
      value: 1000,
      price_date: date,
    });
  });
  return npo!.id;
}

/** `pull` runs while the action reads the body — the request is in flight */
function request(body: object, in_flight?: () => Promise<unknown>) {
  const text = JSON.stringify(body);
  const stream = new ReadableStream(
    {
      async pull(ctl) {
        await in_flight?.();
        ctl.enqueue(new TextEncoder().encode(text));
        ctl.close();
      },
    },
    { highWaterMark: 0 }
  );
  return new Request("http://localhost/admin/1/savings/transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

async function transfer(
  npo_id: number,
  amount: string,
  in_flight?: () => Promise<unknown>
): Promise<Response> {
  return (action as any)({
    request: request({ amount, source: "liq" }, in_flight),
    params: { id: String(npo_id) },
    context: { get: (k: unknown) => (k === admin_ctx ? npo_id : undefined) },
  });
}

async function ledger(npo_id: number) {
  const [npo] = await db()
    .select({ liq: npos.liq, lock_units: npos.lock_units })
    .from(npos)
    .where(eq(npos.id, npo_id));
  const txs = await db()
    .select({
      account: bal_txs.account,
      bal_begin: bal_txs.bal_begin,
      bal_end: bal_txs.bal_end,
      account_other_bal_begin: bal_txs.account_other_bal_begin,
      account_other_bal_end: bal_txs.account_other_bal_end,
    })
    .from(bal_txs)
    .where(eq(bal_txs.npo_id, npo_id))
    .orderBy(bal_txs.account);
  return { ...npo, txs };
}

describe("transfer from savings to investments", () => {
  test("moves the amount into investments, recording the balances it moved between", async () => {
    const npo_id = await seed_npo(100);

    const res = await transfer(npo_id, "30");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/savings");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 70,
      lock_units: 3,
      txs: [
        {
          account: "liq",
          bal_begin: 100,
          bal_end: 70,
          account_other_bal_begin: 0,
          account_other_bal_end: 3,
        },
        {
          account: "lock",
          bal_begin: 0,
          bal_end: 3,
          account_other_bal_begin: 100,
          account_other_bal_end: 70,
        },
      ],
    });
  });

  test("more than the balance is refused and writes nothing", async () => {
    const npo_id = await seed_npo(100);

    const res = await transfer(npo_id, "100.01");

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount exceeds balance");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 100,
      lock_units: 0,
      txs: [],
    });
  });

  test("a second transfer is checked against what the first left", async () => {
    const npo_id = await seed_npo(100);

    const first = await transfer(npo_id, "60");
    const second = await transfer(npo_id, "60");

    expect(first.status).toBe(302);
    expect(second.status).toBe(400);
    expect(await ledger(npo_id)).toMatchObject({ liq: 40, lock_units: 6 });
  });

  test("a transfer landing while another is in flight is counted before the second is checked", async () => {
    const npo_id = await seed_npo(100);

    const res = await transfer(npo_id, "60", () => transfer(npo_id, "60"));

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount exceeds balance");
    expect(await ledger(npo_id)).toMatchObject({ liq: 40, lock_units: 6 });
  });

  test("a zero amount is refused and writes nothing", async () => {
    const npo_id = await seed_npo(100);

    const res = await transfer(npo_id, "0");

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount must be greater than 0");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 100,
      lock_units: 0,
      txs: [],
    });
  });
});
