import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  clear_card_gifts,
  PAID_GRANT,
  seed_card_gift,
} from "#/__tests__/fixtures/card-gift";
import { owed_amounts } from "../pg/schema/owed";
import type { TestDb } from "../pg/test-utils/pglite";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../pg/db", () => ({
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

vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));
vi.mock("../kit/queue", () => ({ enqueue: vi.fn(async () => undefined) }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
// a full refund's subscription lookup: no gift here is recurring
vi.mock("../kit/stripe", () => ({
  stripe: { invoicePayments: { list: vi.fn(async () => ({ data: [] })) } },
}));

// --- imports (after mocks) ---

import { dispute_close } from "../pg/queries/dispute";
import type { DbOrTx } from "../pg/queries/helpers";
import { owed_for_donation } from "../pg/queries/owed";
import { create_test_db } from "../pg/test-utils/pglite";
import { dispute_opened, dispute_won } from "./dispute";
import { refund_failed } from "./failed";
import { reverse_charge } from "./reverse";

// --- setup ---

const OPENED = "2026-10-01T12:00:00.000Z";
const BEFORE_OPENED = "2026-09-30T12:00:00.000Z";
const AFTER_OPENED = "2026-10-02T12:00:00.000Z";
const CLOSED = "2026-10-20T12:00:00.000Z";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(owed_amounts);
  await clear_card_gifts(db);
});

/** the events on a $100 card gift whose $90 grant went out ($3.20 card fee),
 * as a provider delivers them: each acts through the refund core's entries */
const on = (id: string) => ({
  /** `at`: the refund's time at the provider */
  refund: (ref: string, usd: number, at?: string) =>
    reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      share: { taken: usd, of: 100 },
      refunded_at: at,
      source_ref: ref,
      alert_from: "paypal-refund",
      notice: { id: `WH-${ref}`, lines: [] },
    }),
  /** `usd` 0: a filing that states no amount, so can't be sized */
  open: (dispute_id: string, usd: number) =>
    dispute_opened({
      donation_id: id,
      rail: "stripe",
      dispute_id: `${id}:${dispute_id}`,
      opened_at: OPENED,
      disputed: { taken: usd, of: 100 },
      fee_usd: 0,
    }),
  /** a chargeback naming no dispute, as paypal's REVERSED does */
  chargeback: (ref: string, usd: number) =>
    reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "dispute",
      share: { taken: usd, of: 100 },
      source_ref: ref,
      alert_from: "paypal-refund",
      notice: { id: `WH-${ref}`, lines: [] },
    }),
  /** `usd`: the disputed amount the resolution states */
  close: (
    dispute_id: string,
    status: "won" | "lost" | "accepted" | "inquiry_closed",
    usd?: number
  ) =>
    status === "lost"
      ? dispute_close(test_db.current!.db as unknown as DbOrTx, {
          id: `${id}:${dispute_id}`,
          donation_id: id,
          status,
          opened_at: OPENED,
          closed_at: CLOSED,
        })
      : dispute_won({
          donation_id: id,
          rail: "stripe",
          dispute_id: `${id}:${dispute_id}`,
          status,
          ...(usd !== undefined && { disputed: { taken: usd, of: 100 } }),
          opened_at: OPENED,
          closed_at: CLOSED,
        }),
});

const outstanding = async (id: string) =>
  (await owed_for_donation(id)).map((o) => o.outstanding_usd);

describe("the takes ledger, in the orders the review found", () => {
  test("T1: a refund delivered after a dispute's open counts on top of it, and the win leaves it", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.open("D0", 30);
    await e.refund("R1", 10);

    await e.close("D0", "won");

    expect(await outstanding(id)).toEqual([9.32]);
  });

  test("T2: a chargeback delivered twice counts once, its dispute lost, and the next dispute's win leaves it", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.open("D0", 30);
    await e.chargeback("REV-0", 30);
    await e.chargeback("REV-0", 30);
    await e.close("D0", "lost");

    await e.open("D1", 40);
    expect(await outstanding(id)).toEqual([65.24]);
    await e.close("D1", "won");

    expect(await outstanding(id)).toEqual([27.96]);
  });

  test("T3: a chargeback won back no longer counts toward the next dispute", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.open("D0", 30);
    await e.chargeback("REV-0", 30);
    await e.close("D0", "won");
    expect(await outstanding(id)).toEqual([0]);

    await e.open("D1", 40);
    expect(await outstanding(id)).toEqual([37.28]);
    await e.close("D1", "won");

    expect(await outstanding(id)).toEqual([0]);
  });

  test("T4: a chargeback landing before its dispute's filing is claimed by it, counted once", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.chargeback("REV-1", 30);
    await e.open("D1", 30);
    await e.close("D1", "lost");

    await e.open("D2", 20);
    expect(await outstanding(id)).toEqual([46.6]);
    await e.close("D2", "won");

    expect(await outstanding(id)).toEqual([27.96]);
  });

  test("T5: a chargeback redelivered after its filing claimed it finds its take", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.chargeback("REV-1", 30);
    await e.open("D1", 30);
    await e.chargeback("REV-1", 30);

    await e.open("D2", 20);
    expect(await outstanding(id)).toEqual([46.6]);
    await e.close("D2", "won");

    expect(await outstanding(id)).toEqual([27.96]);
  });

  test.each([
    ["filed", ["open", "chargeback"]],
    ["charged back", ["chargeback", "open"]],
  ])(
    "M1: an unsized filing and its $40 chargeback, %s first, owe the $40, and its win nothing",
    async (_, order) => {
      const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
      const e = on(id);
      for (const step of order) {
        await (step === "open" ? e.open("D0", 0) : e.chargeback("REV-0", 40));
      }
      expect(await outstanding(id)).toEqual([37.28]);

      await e.close("D0", "won");

      expect(await outstanding(id)).toEqual([0]);
    }
  );

  test.each([
    [60, 55.92],
    [50, 46.6],
  ])(
    "M2: a $%i claim's refund before ACCEPTED counts once and reverses nothing, as after it",
    async (usd, owed) => {
      const ends = [];
      for (const refund_first of [true, false]) {
        const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
        const e = on(id);
        await e.open("D0", usd);
        if (!refund_first) await e.close("D0", "accepted");
        const res = await e.refund("R-claim", usd);
        if (refund_first) await e.close("D0", "accepted");

        expect(res.status).toBe("partial_owed");
        ends.push(await outstanding(id));
      }

      expect(ends).toEqual([[owed], [owed]]);
    }
  );

  test("L1: a dispute's second chargeback isn't claimed by a later filing of another part", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.open("D0", 50);
    await e.chargeback("REV-1", 20);
    await e.chargeback("REV-2", 30);
    await e.close("D0", "lost");

    await e.open("D1", 40);
    expect(await outstanding(id)).toEqual([83.88]);
    await e.close("D1", "won");

    expect(await outstanding(id)).toEqual([46.6]);
  });

  test("L2: a win resolved before its late filing credits back the chargeback recorded under the reversal", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.chargeback("REV-0", 30);
    expect(await outstanding(id)).toEqual([27.96]);

    await e.close("D0", "won", 30);
    await e.open("D0", 30);

    expect(await outstanding(id)).toEqual([0]);
  });

  test.each([
    ["filed", ["open", "chargeback"]],
    ["charged back", ["chargeback", "open"]],
  ])(
    "M-a: a $50 filing and its $40 chargeback, %s first, owe the $40, and its win nothing",
    async (_, order) => {
      const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
      const e = on(id);
      for (const step of order) {
        await (step === "open" ? e.open("D0", 50) : e.chargeback("REV-0", 40));
      }
      expect(await outstanding(id)).toEqual([37.28]);

      await e.close("D0", "won", 50);

      expect(await outstanding(id)).toEqual([0]);
    }
  );

  test("M-a: a $50 win resolved before its late filing credits back its $40 chargeback", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.chargeback("REV-0", 40);

    await e.close("D0", "won", 50);
    await e.open("D0", 50);

    expect(await outstanding(id)).toEqual([0]);
  });

  test.each(["accepted", "inquiry_closed"] as const)(
    "L-a: a dispute closed %s never undoes a chargeback of the same part recorded under its reversal",
    async (status) => {
      const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
      const e = on(id);
      await e.chargeback("REV-0", 30);

      await e.close("D1", status, 30);

      expect(await outstanding(id)).toEqual([27.96]);
    }
  );
});

describe("the takes ledger, a refund and a claim delivered out of order", () => {
  test("a refund that failed before any event recorded it is never added by an event that read it as succeeded", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);

    const failed = await refund_failed({
      donation_id: id,
      rail: "stripe",
      refund_id: "R1",
    });
    await e.refund("R1", 40);

    expect(failed.status).toBe("not_recorded");
    expect(await outstanding(id)).toEqual([]);
    await e.refund("R2", 30);
    expect(await outstanding(id)).toEqual([27.96]);
  });

  test("an accepted claim's refund delivered before its filing, then redelivered, reverses nothing and owes the refund's share", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.refund("R-claim", 60, AFTER_OPENED);

    await e.open("D0", 60);
    const again = await e.refund("R-claim", 60, AFTER_OPENED);
    expect(again.status).toBe("partial_owed");
    expect(await outstanding(id)).toEqual([55.92]);

    await e.close("D0", "accepted");
    expect(await outstanding(id)).toEqual([55.92]);
  });

  test("a refund made before a dispute of the same part, delivered after it opened, leaves the dispute its own", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.refund("R1", 30, BEFORE_OPENED);

    await e.open("D0", 30);

    expect(await outstanding(id)).toEqual([55.92]);
  });

  test("a dispute paired with a refund that turns out not to be its claim counts again once charged back", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    const e = on(id);
    await e.refund("R1", 30, AFTER_OPENED);
    await e.open("D0", 30);
    expect(await outstanding(id)).toEqual([27.96]);

    await e.chargeback("REV-0", 30);

    expect(await outstanding(id)).toEqual([55.92]);
  });

  test("a dispute opened after a refund of the same part is its own", async () => {
    const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
    await on(id).refund("R1", 30);

    await dispute_opened({
      donation_id: id,
      rail: "stripe",
      dispute_id: `${id}:D0`,
      opened_at: new Date().toISOString(),
      disputed: { taken: 30, of: 100 },
      fee_usd: 0,
    });

    expect(await outstanding(id)).toEqual([55.92]);
  });
});

/** a seeded generator, so a failing order reproduces */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function shuffled<T>(xs: T[], next: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

type Step = (e: ReturnType<typeof on>) => Promise<unknown>;

/** each [a, b]: a comes before b */
type Rule = [string, string];

const OUTCOME_AFTER_FILING: Rule[] = [["open", "outcome"]];

/** the same events in many orders, keeping only the orderings providers keep
 * (`rules`); one event redelivered at the end */
describe("the takes ledger, in any order", () => {
  const scenarios: [string, Record<string, Step>, Rule[], number][] = [
    [
      "a refund, then a dispute lost with its chargeback",
      {
        refund: (e) => e.refund("R1", 20),
        open: (e) => e.open("D", 30),
        chargeback: (e) => e.chargeback("REV", 30),
        outcome: (e) => e.close("D", "lost"),
      },
      OUTCOME_AFTER_FILING,
      46.6,
    ],
    [
      "a refund, then a dispute won after its chargeback",
      {
        refund: (e) => e.refund("R1", 20),
        open: (e) => e.open("D", 30),
        chargeback: (e) => e.chargeback("REV", 30),
        outcome: (e) => e.close("D", "won"),
      },
      OUTCOME_AFTER_FILING,
      18.64,
    ],
    [
      "a refund, then a claim accepted and paid by a refund",
      {
        refund: (e) => e.refund("R1", 20),
        open: (e) => e.open("D", 30),
        outcome: (e) => e.close("D", "accepted"),
        claim: (e) => e.refund("R-claim", 30),
      },
      OUTCOME_AFTER_FILING,
      46.6,
    ],
    [
      // unsized, a chargeback after the win can't be told from a new loss
      "an unsized filing and its $40 chargeback, the dispute won",
      {
        open: (e) => e.open("D", 0),
        chargeback: (e) => e.chargeback("REV", 40),
        outcome: (e) => e.close("D", "won"),
      },
      [...OUTCOME_AFTER_FILING, ["chargeback", "outcome"]],
      0,
    ],
    [
      // sized, a chargeback after the win can't be told from a new loss
      "a $50 filing and its $40 chargeback, the dispute won",
      {
        open: (e) => e.open("D", 50),
        chargeback: (e) => e.chargeback("REV", 40),
        outcome: (e) => e.close("D", "won", 50),
      },
      [...OUTCOME_AFTER_FILING, ["chargeback", "outcome"]],
      0,
    ],
    [
      "a $60 claim accepted and paid by its refund",
      {
        open: (e) => e.open("D", 60),
        outcome: (e) => e.close("D", "accepted"),
        claim: (e) => e.refund("R-claim", 60),
      },
      OUTCOME_AFTER_FILING,
      55.92,
    ],
    [
      // charged back after its filing, and before another's, which a
      // chargeback naming no dispute could otherwise land on
      "a dispute charged back in two parts and lost, then another's filing",
      {
        open: (e) => e.open("D", 50),
        first: (e) => e.chargeback("REV-1", 20),
        second: (e) => e.chargeback("REV-2", 30),
        outcome: (e) => e.close("D", "lost"),
        other: (e) => e.open("D1", 40),
      },
      [
        ...OUTCOME_AFTER_FILING,
        ["open", "first"],
        ["open", "second"],
        ["first", "other"],
        ["second", "other"],
        ["outcome", "other"],
      ],
      83.88,
    ],
  ];

  test.each(scenarios)(
    "%s owes the same in every order",
    async (_, steps, rules, owed) => {
      const next = rng(7);
      const names = Object.keys(steps);
      const kept = (order: string[]) =>
        rules.every(([a, b]) => order.indexOf(a) < order.indexOf(b));
      for (let run = 0; run < 8; run++) {
        let order = shuffled(names, next);
        while (!kept(order)) order = shuffled(names, next);
        const redelivered = names[Math.floor(next() * names.length)]!;
        const { id } = await seed_card_gift(test_db.current!.db, PAID_GRANT);
        const e = on(id);
        for (const n of [...order, redelivered]) await steps[n]!(e);

        expect({ order, redelivered, owed: await outstanding(id) }).toEqual({
          order,
          redelivered,
          owed: [owed],
        });
      }
    }
  );
});
