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
import { npos } from "$/pg/schema/npo";
import { payouts } from "$/pg/schema/payout";
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
import { withdraw_action } from "./withdraw-action";

const db = () => test_db.current!.db;
const action = withdraw_action({ liq: "/savings", lock: "/investments" });

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(payouts);
  await db().delete(bal_txs);
  await db().delete(npos);
});

const seed_npo = (liq: number) =>
  insert_npo(db(), { registration_number: "EIN-WITHDRAW", liq }).then(
    (x) => x!.id
  );

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
  return new Request("http://localhost/admin/1/dashboard/withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

async function withdraw(
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
    .select({ liq: npos.liq, cash: npos.cash })
    .from(npos)
    .where(eq(npos.id, npo_id));
  const txs = await db()
    .select({
      bal_begin: bal_txs.bal_begin,
      bal_end: bal_txs.bal_end,
      amount: bal_txs.amount,
    })
    .from(bal_txs)
    .where(eq(bal_txs.npo_id, npo_id));
  const pays = await db()
    .select({ amount: payouts.amount })
    .from(payouts)
    .where(eq(payouts.npo_id, npo_id));
  return { ...npo, txs, payouts: pays };
}

describe("withdraw from savings", () => {
  test("pays out the amount, recording the balance it was drawn from", async () => {
    const npo_id = await seed_npo(100);

    const res = await withdraw(npo_id, "30");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/savings");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 70,
      cash: 30,
      txs: [{ bal_begin: 100, bal_end: 70, amount: 30 }],
      payouts: [{ amount: 30 }],
    });
  });

  test("more than the balance is refused and writes nothing", async () => {
    const npo_id = await seed_npo(100);

    const res = await withdraw(npo_id, "100.01");

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount exceeds balance");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 100,
      txs: [],
      payouts: [],
    });
  });

  test("a second withdrawal is checked against what the first left", async () => {
    const npo_id = await seed_npo(100);

    const first = await withdraw(npo_id, "60");
    const second = await withdraw(npo_id, "60");

    expect(first.status).toBe(302);
    expect(second.status).toBe(400);
    expect(await ledger(npo_id)).toMatchObject({
      liq: 40,
      txs: [{ bal_begin: 100, bal_end: 40 }],
      payouts: [{ amount: 60 }],
    });
  });

  test("a withdrawal landing while another is in flight is counted before the second is checked", async () => {
    const npo_id = await seed_npo(100);

    const res = await withdraw(npo_id, "60", () => withdraw(npo_id, "60"));

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount exceeds balance");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 40,
      payouts: [{ amount: 60 }],
    });
  });

  test("a zero amount is refused and writes nothing", async () => {
    const npo_id = await seed_npo(100);

    const res = await withdraw(npo_id, "0");

    expect(res.status).toBe(400);
    expect(res.statusText).toBe("amount must be greater than 0");
    expect(await ledger(npo_id)).toMatchObject({
      liq: 100,
      txs: [],
      payouts: [],
    });
  });
});
