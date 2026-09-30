import { desc, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";
import { seed_npo as insert_npo } from "#/__tests__/fixtures/funds";
import type { IBalanceTx } from "@/balance-txs";
import { bal_txs } from "$/pg/schema/bal-tx";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts, settlements } from "$/pg/schema/payout";
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

vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

import { create_test_db } from "$/pg/test-utils/pglite";
import { action } from "./api";

const db = () => test_db.current!.db;
const TX_ID = "redeem-1";

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
  await db().delete(payouts);
  await db().delete(settlements);
  await db().delete(bal_txs);
  await db().delete(npos);
});

/**
 * the state a $300 redemption leaves (to a grant unless `to` says savings):
 * 30 of the npo's 100 units moved out of `lock_units` into a pending lock tx,
 * fund priced at $10/unit.
 */
async function seed_redemption(opts: { cash: number; to?: "grant" | "liq" }) {
  const npo = await insert_npo(db(), {
    registration_number: "EIN-REDEEM",
    lock_units: 70,
  });
  const now = new Date().toISOString();
  // nav_logs' deferred trigger wants its positions in the same transaction
  await db().transaction(async (pg) => {
    await pg.insert(nav_logs).values({
      date: now,
      reason: "seed",
      units: 100,
      price: 10,
      price_updated: now,
    });
    await pg.insert(nav_log_positions).values({
      date: now,
      ticker: "CASH",
      qty: opts.cash,
      price: 1,
      value: opts.cash,
      price_date: now,
    });
    await pg
      .insert(nav_holders)
      .values({ date: now, npo_id: npo!.id, units: 100 });
  });
  const tx: IBalanceTx = {
    id: TX_ID,
    date_created: now,
    date_updated: now,
    npo_id: npo!.id,
    account: "lock",
    status: "pending",
    bal_begin: 100,
    bal_end: 70,
    amount: 300,
    amount_units: 30,
    account_other_id: null,
    account_other: opts.to ?? "grant",
    account_other_bal_begin: null,
    account_other_bal_end: null,
  };
  await db().insert(bal_txs).values(tx);
  return npo!;
}

/** the action's answer, returned or thrown — a `Response` either way */
async function submit(verdict: string, tx_id = TX_ID): Promise<Response> {
  const request = new Request(
    `http://localhost/platform/redeem-requests/${tx_id}/${verdict}`,
    { method: "POST", body: new URLSearchParams({ verdict }) }
  );
  const res = await (action as any)({
    request,
    params: { tx_id },
    context: {},
  }).catch((e: unknown) => e);
  expect(res).toBeInstanceOf(Response);
  return res;
}

/** the two 409s differ only by their text */
const SETTLED = {
  status: 409,
  statusText: expect.stringMatching(/already settled/i),
};
const SHORT_OF_CASH = {
  status: 409,
  statusText: expect.stringMatching(/insufficient cash/i),
};

async function ledger(npo_id: number) {
  const [npo] = await db()
    .select({ cash: npos.cash, liq: npos.liq, lock_units: npos.lock_units })
    .from(npos)
    .where(eq(npos.id, npo_id));
  const [tx] = await db()
    .select({ status: bal_txs.status })
    .from(bal_txs)
    .where(eq(bal_txs.id, TX_ID));
  const [fund_cash] = await db()
    .select({ qty: nav_log_positions.qty })
    .from(nav_log_positions)
    .where(eq(nav_log_positions.ticker, "CASH"))
    .orderBy(desc(nav_log_positions.date))
    .limit(1);
  const [holding] = await db()
    .select({ units: nav_holders.units })
    .from(nav_holders)
    .where(eq(nav_holders.npo_id, npo_id))
    .orderBy(desc(nav_holders.date))
    .limit(1);
  return {
    ...npo,
    status: tx?.status,
    fund_cash: fund_cash?.qty,
    fund_units: holding?.units,
    bal_txs: (await db().select().from(bal_txs)).length,
    payouts: (await db().select().from(payouts)).length,
    nav_logs: (await db().select().from(nav_logs)).length,
  };
}

describe("redeem request verdict", () => {
  test("a second approve is refused with 409 and pays nothing more", async () => {
    const npo = await seed_redemption({ cash: 1000 });

    expect((await submit("approve")).status).toBe(302);
    const paid = await ledger(npo.id);
    expect(paid).toEqual({
      cash: 300,
      liq: 0,
      lock_units: 70,
      status: "final",
      fund_cash: 700,
      fund_units: 70,
      bal_txs: 1,
      payouts: 1,
      nav_logs: 2,
    });

    expect(await submit("approve")).toMatchObject(SETTLED);
    expect(await ledger(npo.id)).toEqual(paid);
  });

  test("a second approve to savings is refused with 409 and credits nothing more", async () => {
    const npo = await seed_redemption({ cash: 1000, to: "liq" });

    expect((await submit("approve")).status).toBe(302);
    const credited = await ledger(npo.id);
    expect(credited).toEqual({
      cash: 0,
      liq: 300,
      lock_units: 70,
      status: "final",
      fund_cash: 700,
      fund_units: 70,
      bal_txs: 2,
      payouts: 0,
      nav_logs: 2,
    });

    expect(await submit("approve")).toMatchObject(SETTLED);
    expect(await ledger(npo.id)).toEqual(credited);
  });

  test("a second reject is refused with 409 and adds no units back", async () => {
    const npo = await seed_redemption({ cash: 1000 });

    expect((await submit("reject")).status).toBe(302);
    const refunded = await ledger(npo.id);
    expect(refunded).toEqual({
      cash: 0,
      liq: 0,
      lock_units: 100,
      status: "cancelled",
      fund_cash: 1000,
      fund_units: 100,
      bal_txs: 1,
      payouts: 0,
      nav_logs: 1,
    });

    expect(await submit("reject")).toMatchObject(SETTLED);
    expect(await ledger(npo.id)).toEqual(refunded);
  });

  test("a reject goes through while the fund is short of cash", async () => {
    const npo = await seed_redemption({ cash: 100 });

    expect((await submit("reject")).status).toBe(302);
    expect(await ledger(npo.id)).toMatchObject({
      lock_units: 100,
      status: "cancelled",
    });
  });

  test("an approve the fund's cash can't cover is refused with 409", async () => {
    const npo = await seed_redemption({ cash: 100 });
    const before = await ledger(npo.id);

    expect(await submit("approve")).toMatchObject(SHORT_OF_CASH);
    expect(await ledger(npo.id)).toEqual(before);
  });

  test.each(["approve", "reject"])(
    "%s of an unknown request is a 404",
    async (verdict) => {
      await seed_redemption({ cash: 1000 });

      expect((await submit(verdict, "no-such-tx")).status).toBe(404);
    }
  );

  test("an approve after a reject is refused with 409 and pays nothing", async () => {
    const npo = await seed_redemption({ cash: 1000 });
    await submit("reject");
    const refunded = await ledger(npo.id);

    expect(await submit("approve")).toMatchObject(SETTLED);
    expect(await ledger(npo.id)).toEqual(refunded);
  });

  /** a second pending $300 redemption of the same npo, beside `seed_redemption`'s */
  async function seed_second(npo_id: number, to: "grant" | "liq" = "grant") {
    const [first] = await db()
      .select()
      .from(bal_txs)
      .where(eq(bal_txs.id, TX_ID));
    await db()
      .insert(bal_txs)
      .values({ ...first!, id: "redeem-2", npo_id, account_other: to });
  }

  // nav_logs is keyed by date: two verdicts stamped in one millisecond collide
  // on that key before the race under test is reached
  function tick_each_now() {
    const Real = Date;
    let t = Real.now();
    class Ticking extends Real {
      constructor(...args: [] | [string | number | Date]) {
        if (args.length === 0) super(++t);
        else super(args[0]);
      }
      static override now() {
        return ++t;
      }
    }
    vi.stubGlobal("Date", Ticking);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
  }

  test("two approvals at once that cash covers only one of: one pays, one is refused", async () => {
    const npo = await seed_redemption({ cash: 400 });
    tick_each_now();
    await seed_second(npo.id);

    const answers = await Promise.all([
      submit("approve"),
      submit("approve", "redeem-2"),
    ]);

    expect(answers.map((r) => r.status).sort()).toEqual([302, 409]);
    expect(answers.find((r) => r.status === 409)).toMatchObject(SHORT_OF_CASH);
    expect(await ledger(npo.id)).toMatchObject({ cash: 300, fund_cash: 100 });
  });

  test("two savings approvals at once each record the balance the other left", async () => {
    const npo = await seed_redemption({ cash: 1000, to: "liq" });
    await seed_second(npo.id, "liq");
    tick_each_now();

    await Promise.all([submit("approve"), submit("approve", "redeem-2")]);

    const liq_txs = await db()
      .select({ begin: bal_txs.bal_begin, end: bal_txs.bal_end })
      .from(bal_txs)
      .where(eq(bal_txs.account, "liq"));
    expect(liq_txs.map((t) => [t.begin, t.end]).sort()).toEqual([
      [0, 300],
      [300, 600],
    ]);
  });

  test("a verdict on a tx that isn't a redemption is a 400", async () => {
    await seed_redemption({ cash: 1000 });
    await db()
      .update(bal_txs)
      .set({ account: "liq" })
      .where(eq(bal_txs.id, TX_ID));

    expect((await submit("reject")).status).toBe(400);
  });
});
