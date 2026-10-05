import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { donation_disputes } from "../schema/dispute";
import { donations } from "../schema/donation";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { dispute_close, dispute_open, disputes_of_donation } from "./dispute";
import type { DbOrTx } from "./helpers";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read
const as_db = (x: unknown) => x as DbOrTx;

const DON = "don-1";
const OPENED = "2026-10-01T12:00:00.000Z";
const CLOSED = "2026-10-20T12:00:00.000Z";

let t: TestDb;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  await t.db.delete(donation_disputes);
  await t.db.delete(donations);
  await t.db.insert(donations).values({
    id: DON,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
});

const opened = { id: "du_1", donation_id: DON, opened_at: OPENED };

describe("donation_disputes", () => {
  test.each([
    ["closed with no close date", { status: "lost", closed_at: null }],
    ["open with a close date", { status: "open", closed_at: CLOSED }],
    ["of an unknown status", { status: "withdrawn", closed_at: CLOSED }],
  ] as const)("rejects a dispute %s", async (_, row) => {
    await expect(
      t.db.insert(donation_disputes).values({
        ...opened,
        ...row,
        status: row.status as "open",
      })
    ).rejects.toThrow();
  });
});

describe("dispute_open", () => {
  test("records the dispute open on its gift", async () => {
    await dispute_open(as_db(t.db), opened);

    expect(await disputes_of_donation(DON, as_db(t.db))).toEqual([
      {
        id: "du_1",
        donation_id: DON,
        status: "open",
        opened_at: OPENED,
        closed_at: null,
      },
    ]);
  });

  test("a redelivered open changes nothing", async () => {
    await dispute_open(as_db(t.db), opened);
    await dispute_open(as_db(t.db), {
      ...opened,
      opened_at: "2026-10-02T12:00:00.000Z",
    });

    expect(await disputes_of_donation(DON, as_db(t.db))).toMatchObject([
      { id: "du_1", status: "open", opened_at: OPENED },
    ]);
  });
});

describe("dispute_close", () => {
  test.each(["lost", "won"] as const)(
    "records the dispute %s",
    async (status) => {
      await dispute_open(as_db(t.db), opened);
      await dispute_close(as_db(t.db), {
        ...opened,
        status,
        closed_at: CLOSED,
      });

      expect(await disputes_of_donation(DON, as_db(t.db))).toMatchObject([
        { id: "du_1", status, opened_at: OPENED, closed_at: CLOSED },
      ]);
    }
  );

  test("a redelivered close changes nothing", async () => {
    await dispute_open(as_db(t.db), opened);
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "lost",
      closed_at: CLOSED,
    });
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "won",
      closed_at: "2026-10-21T12:00:00.000Z",
    });

    expect(await disputes_of_donation(DON, as_db(t.db))).toMatchObject([
      { status: "lost", closed_at: CLOSED },
    ]);
  });

  test("an open redelivered after its close leaves it closed", async () => {
    await dispute_open(as_db(t.db), opened);
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "won",
      closed_at: CLOSED,
    });
    await dispute_open(as_db(t.db), opened);

    expect(await disputes_of_donation(DON, as_db(t.db))).toMatchObject([
      { status: "won", closed_at: CLOSED },
    ]);
  });

  test("records a dispute whose open was never recorded", async () => {
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "lost",
      closed_at: CLOSED,
    });

    expect(await disputes_of_donation(DON, as_db(t.db))).toEqual([
      {
        id: "du_1",
        donation_id: DON,
        status: "lost",
        opened_at: OPENED,
        closed_at: CLOSED,
      },
    ]);
  });
});
