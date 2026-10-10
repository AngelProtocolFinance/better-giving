import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { disputes_of } from "#/__tests__/fixtures/card-gift";
import { donation_disputes } from "../schema/dispute";
import { donations } from "../schema/donation";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { dispute_close, dispute_get, dispute_open } from "./dispute";
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

    expect(await disputes_of(t.db, DON)).toEqual([
      {
        id: "du_1",
        donation_id: DON,
        status: "open",
        opened_at: OPENED,
        closed_at: null,
        share: null,
        fee_usd: null,
        cumulative_share: null,
        loss_recorded_at: null,
      },
    ]);
  });

  test("a redelivered open changes nothing, and says it found the dispute", async () => {
    const first = await dispute_open(as_db(t.db), opened);
    const again = await dispute_open(as_db(t.db), {
      ...opened,
      opened_at: "2026-10-02T12:00:00.000Z",
    });

    expect([first, again]).toEqual([
      { status: "open", inserted: true },
      { status: "open", inserted: false },
    ]);
    expect(await disputes_of(t.db, DON)).toMatchObject([
      { id: "du_1", status: "open", opened_at: OPENED },
    ]);
  });
});

describe("dispute_get", () => {
  test("reads one dispute by its provider id", async () => {
    await dispute_open(as_db(t.db), opened);
    await dispute_open(as_db(t.db), { ...opened, id: "du_2" });

    expect(await dispute_get("du_2", as_db(t.db))).toEqual({
      id: "du_2",
      donation_id: DON,
      status: "open",
      opened_at: OPENED,
      closed_at: null,
      share: null,
      fee_usd: null,
      cumulative_share: null,
      loss_recorded_at: null,
    });
    expect(await dispute_get("du_none", as_db(t.db))).toBeUndefined();
  });
});

describe("dispute_close", () => {
  test.each(["lost", "won", "inquiry_closed"] as const)(
    "records the dispute %s",
    async (status) => {
      await dispute_open(as_db(t.db), opened);
      await dispute_close(as_db(t.db), {
        ...opened,
        status,
        closed_at: CLOSED,
      });

      expect(await disputes_of(t.db, DON)).toMatchObject([
        { id: "du_1", status, opened_at: OPENED, closed_at: CLOSED },
      ]);
    }
  );

  const LATER = "2026-10-21T12:00:00.000Z";
  const close = (status: "lost" | "won", closed_at: string) =>
    dispute_close(as_db(t.db), { ...opened, status, closed_at });

  test("a redelivered close changes nothing", async () => {
    await dispute_open(as_db(t.db), opened);
    await close("lost", CLOSED);

    expect(await close("lost", CLOSED)).toBe("lost");
    expect(await disputes_of(t.db, DON)).toMatchObject([
      { status: "lost", closed_at: CLOSED },
    ]);
  });

  test("a later close stands: a win on appeal after the loss", async () => {
    await dispute_open(as_db(t.db), opened);
    await close("lost", CLOSED);

    expect(await close("won", LATER)).toBe("won");
    expect(await disputes_of(t.db, DON)).toMatchObject([
      { status: "won", closed_at: LATER },
    ]);
  });

  test("an earlier close delivered after a later one changes nothing, and says what stands", async () => {
    await dispute_open(as_db(t.db), opened);
    await close("won", LATER);

    expect(await close("lost", CLOSED)).toBe("won");
    expect(await disputes_of(t.db, DON)).toMatchObject([
      { status: "won", closed_at: LATER },
    ]);
  });

  test("an open redelivered after its close leaves it closed, and says so", async () => {
    await dispute_open(as_db(t.db), opened);
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "won",
      closed_at: CLOSED,
    });

    expect(await dispute_open(as_db(t.db), opened)).toEqual({
      status: "won",
      inserted: false,
    });
    expect(await disputes_of(t.db, DON)).toMatchObject([
      { status: "won", closed_at: CLOSED },
    ]);
  });

  test("records a dispute whose open was never recorded", async () => {
    await dispute_close(as_db(t.db), {
      ...opened,
      status: "lost",
      closed_at: CLOSED,
    });

    expect(await disputes_of(t.db, DON)).toEqual([
      {
        id: "du_1",
        donation_id: DON,
        status: "lost",
        opened_at: OPENED,
        closed_at: CLOSED,
        share: null,
        fee_usd: null,
        cumulative_share: null,
        loss_recorded_at: null,
      },
    ]);
  });
});
