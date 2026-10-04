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
import type { IDonation } from "@/donations";
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "../pg/schema/donation";
import { donation_match_events } from "../pg/schema/match";
import { npos } from "../pg/schema/npo";
import { payouts } from "../pg/schema/payout";
import { referrer_commissions } from "../pg/schema/referrer";
import { loss_logs } from "../pg/schema/revenue";
import { subscriptions } from "../pg/schema/subscription";
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

const fiat_alert = vi.hoisted(() => vi.fn());
vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: fiat_alert } }));

const enqueue = vi.hoisted(() => vi.fn());
vi.mock("../kit/queue", () => ({ enqueue }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

// the stripe boundary the subscription lookup crosses: which subscription, if
// any, the refunded payment intent paid an invoice of
const invoice_sub = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../kit/stripe", () => ({
  stripe: {
    invoicePayments: {
      list: vi.fn(async () => ({
        data: invoice_sub.id
          ? [
              {
                invoice: {
                  parent: {
                    subscription_details: { subscription: invoice_sub.id },
                  },
                },
              },
            ]
          : [],
      })),
    },
  },
}));

// --- imports (after mocks) ---

import { create_test_db } from "../pg/test-utils/pglite";
import { rail_adapters, reverse_charge } from "./reverse";

// --- setup ---

let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  invoice_sub.id = null;
  enqueue.mockResolvedValue(undefined);
  const db = test_db.current!.db;
  await db.delete(bal_txs);
  await db.delete(loss_logs);
  await db.delete(payouts);
  await db.delete(dists);
  await db.delete(donation_match_events);
  await db.delete(donation_settlements);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(subscriptions);
  await db.delete(referrer_commissions);
  await db.delete(npos);
});

/** a settled gift of $100 on `via`, distributed whole to one npo's liquid
 * balance, which holds $1000 */
async function seed(via: string, o?: { fee?: number; currency?: string }) {
  counter++;
  const db = test_db.current!.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-REV-${counter}`,
      name: `Test NPO ${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      liq: 1000,
      lock_units: 0,
      cash: 0,
    })
    .returning();

  const id = `don-${counter}`;
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via,
  });
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id: npo!.id,
    name: npo!.name,
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
  });
  await db.insert(donation_settlements).values({
    donation_id: id,
    sttl_id: `sttl-${counter}`,
    date: "2026-07-01T00:00:00.000Z",
    currency: o?.currency ?? "USD",
    net: 96.8,
    fee: o?.fee ?? 3.2,
  });
  await db.insert(dists).values({
    id: `dist-${id}`,
    donation_id: id,
    status: "settled",
    date_created: "2026-07-01T00:00:00.000Z",
    to_id: npo!.id,
    to_name: npo!.name,
    amount: 100,
    amount_usd: 100,
    amount_denom: "USD",
    net: 100,
    fee_base: 0,
    fee_fsa: 0,
    fee_processing: 0,
    alloc: { liq: 100, lock: 0, cash: 0 },
  });
  return { id, npo_id: npo!.id, sttl_id: `sttl-${counter}` };
}

const notice = { id: "evt_1", lines: ["donation x, charge ch_1, event evt_1"] };

async function state(id: string, npo_id: number) {
  const db = test_db.current!.db;
  const [don] = await db.select().from(donations).where(eq(donations.id, id));
  const [dist] = await db.select().from(dists).where(eq(dists.donation_id, id));
  const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
  return {
    don: don!.status,
    dist: [dist!.status, dist!.refund_status],
    liq: npo!.liq,
    bal_txs: (await db.select().from(bal_txs)).length,
  };
}

describe("reverse_charge — a full refund", () => {
  test("reverses a stripe gift: npo debited, dist and donation refunded", async () => {
    const { id, npo_id } = await seed("stripe:card");

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
    });

    expect(res).toMatchObject({ status: "reversed", applied: 1 });
    expect(await state(id, npo_id)).toEqual({
      don: "refunded",
      dist: ["refunded", "completed"],
      liq: 900,
      bal_txs: 1,
    });
  });
});

describe("reverse_charge — every refundable rail", () => {
  test.each([
    ["stripe", "stripe:us_bank_account", "refund"],
    ["stripe", "stripe:card", "dispute"],
    ["stripe", "stripe:card", "admin"],
    ["paypal", "paypal", "refund"],
    ["paypal", "paypal", "dispute"],
    ["crypto", "crypto:eth", "refund"],
  ] as const)(
    "a full %s reversal (%s, %s) lands as a full refund does",
    async (rail, via, source) => {
      const { id, npo_id } = await seed(via);

      const res = await reverse_charge({
        donation_id: id,
        rail,
        source,
        alert_from: "test",
        notice,
      });

      expect(res).toMatchObject({ status: "reversed", applied: 1 });
      expect(await state(id, npo_id)).toEqual({
        don: "refunded",
        dist: ["refunded", "completed"],
        liq: 900,
        bal_txs: 1,
      });
    }
  );
});

describe("reverse_charge — a redelivery", () => {
  test.each(["refunded", "refunded_loss"])(
    "on a %s gift reverses nothing",
    async (status) => {
      const { id, npo_id } = await seed("stripe:card");
      await test_db
        .current!.db.update(donations)
        .set({ status })
        .where(eq(donations.id, id));

      const res = await reverse_charge({
        donation_id: id,
        rail: "stripe",
        source: "refund",
        alert_from: "charge-refunded",
        notice,
      });

      expect(res).toEqual({
        status: "already_reversed",
        donation_status: status,
      });
      expect(await state(id, npo_id)).toEqual({
        don: status,
        dist: ["settled", null],
        liq: 1000,
        bal_txs: 0,
      });
      expect(enqueue).not.toHaveBeenCalled();
      expect(fiat_alert).not.toHaveBeenCalled();
    }
  );
});

describe("reverse_charge — a partial amount", () => {
  const queued = () =>
    enqueue.mock.calls.flat().filter((m) => m.id === "fiat-notice");

  test.each([
    ["refund", "Partial Refund Not Reversed"],
    ["dispute", "Lost Dispute Not Reversed"],
  ] as const)(
    "a %s of part of the charge reverses nothing and tells ops to settle it by hand",
    async (source, title) => {
      const { id, npo_id } = await seed("stripe:card");

      const res = await reverse_charge({
        donation_id: id,
        rail: "stripe",
        source,
        amount: 40,
        dispute_fee:
          source === "dispute" ? { amount: 15, currency: "usd" } : undefined,
        alert_from: "charge-refunded",
        notice: {
          id: "evt_9",
          lines: ["donation x, charge ch_1, event evt_9"],
        },
      });

      expect(res).toEqual({ status: "partial_not_acted" });
      expect(await state(id, npo_id)).toEqual({
        don: "settled",
        dist: ["settled", null],
        liq: 1000,
        bal_txs: 0,
      });
      const [m, ...rest] = queued();
      expect(rest).toEqual([]);
      expect(m.payload.id).toBe("evt_9");
      expect(m.payload.alert).toMatchObject({
        type: "NOTICE",
        from: expect.stringMatching(/^charge-refunded-/),
        title,
      });
      const body: string[] = m.payload.alert.body.split("\n");
      expect(body[0]).toBe("donation x, charge ch_1, event evt_9");
      expect(body.at(-1)).toMatch(/^nothing was reversed automatically/);
    }
  );
});

describe("reverse_charge — a reversal that can't finish", () => {
  test("a gift not distributed yet reverses nothing and stays settled for a redelivery", async () => {
    const { id } = await seed("paypal");
    await test_db.current!.db.delete(dists).where(eq(dists.donation_id, id));

    const res = await reverse_charge({
      donation_id: id,
      rail: "paypal",
      source: "refund",
      alert_from: "paypal-refund",
      notice,
    });

    expect(res).toEqual({ status: "failed", reason: "not_distributed" });
    const [don] = await test_db
      .current!.db.select()
      .from(donations)
      .where(eq(donations.id, id));
    expect(don!.status).toBe("settled");
  });

  test("a dist that fails to reverse leaves the gift settled and names the failure", async () => {
    const { id, npo_id } = await seed("crypto:eth");
    // no npo behind it: the strict plan load throws, so this dist fails
    await test_db.current!.db.insert(dists).values({
      id: `dist-${id}-orphan`,
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: null,
      amount_denom: "USD",
      net: 10,
      alloc: { liq: 100, lock: 0, cash: 0 },
    });

    const res = await reverse_charge({
      donation_id: id,
      rail: "crypto",
      source: "refund",
      alert_from: "nowpayments-refunded",
      notice,
    });

    expect(res).toEqual({
      status: "failed",
      reason: "incomplete",
      dists: 2,
      applied: 1,
      failures: [`dist dist-${id}-orphan: npo:0 not found`],
    });
    const [don] = await test_db
      .current!.db.select()
      .from(donations)
      .where(eq(donations.id, id));
    expect(don!.status).toBe("settled");
    const [npo] = await test_db
      .current!.db.select()
      .from(npos)
      .where(eq(npos.id, npo_id));
    expect(npo!.liq).toBe(900);
  });
});

describe("reverse_charge — a gift on another rail", () => {
  test("reverses nothing", async () => {
    const { id, npo_id } = await seed("crypto:eth");

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "admin",
      alert_from: "refund-action",
      notice,
    });

    expect(res).toEqual({ status: "failed", reason: "wrong_rail" });
    expect((await state(id, npo_id)).dist).toEqual(["settled", null]);
  });
});

describe("rail_adapters — what the gift cost us to take", () => {
  const gift = (settlement?: { fee: number; currency: string }) =>
    ({
      settlement: settlement && {
        id: "sttl-1",
        date: "2026-07-01T00:00:00.000Z",
        net: 96.8,
        ...settlement,
      },
    }) as IDonation;

  test.each([
    ["stripe", { fee: 3.2, currency: "USD" }, { amount: 3.2, currency: "USD" }],
    ["paypal", { fee: 2.5, currency: "EUR" }, { amount: 2.5, currency: "EUR" }],
    // nowpayments' fee is converted to usd at settle, beside an outcome token label
    [
      "crypto",
      { fee: 1.1, currency: "USDC" },
      { amount: 1.1, currency: "USD" },
    ],
  ] as const)("%s reads the fee its settlement stored", (rail, sttl, fee) => {
    expect(rail_adapters[rail].processing_fee(gift(sttl))).toEqual(fee);
  });

  test.each(["stripe", "paypal", "crypto"] as const)(
    "%s answers null for a gift with no settlement on record",
    (rail) => {
      expect(rail_adapters[rail].processing_fee(gift())).toBeNull();
    }
  );
});

describe("rail_adapters — whether the recurring gift ends", () => {
  test.each([
    ["stripe", "refund", true],
    ["stripe", "admin", true],
    ["stripe", "dispute", false],
    ["paypal", "refund", false],
    ["paypal", "dispute", false],
    ["crypto", "refund", false],
  ] as const)("%s %s: %s", (rail, source, ends) => {
    expect(rail_adapters[rail].subscription_end(source) !== null).toBe(ends);
  });
});

describe("reverse_charge — a subscription payment", () => {
  async function seed_sub(npo_id: number) {
    await test_db.current!.db.insert(subscriptions).values({
      id: "sub_1",
      interval: "month",
      interval_count: 1,
      next_billing: "2026-08-01T00:00:00.000Z",
      amount: 100,
      amount_usd: 100,
      currency: "USD",
      product_id: "prod_1",
      to_npo_id: npo_id,
      to_name: "npo",
      platform: "stripe",
      status: "active",
      from_id: "donor@test.com",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    });
    invoice_sub.id = "sub_1";
  }
  const sub = async () =>
    (await test_db.current!.db.select().from(subscriptions))[0]!;
  const deactivated = () =>
    enqueue.mock.calls.flat().filter((m) => m.id === "sub-deactivated");

  test("a stripe refund ends the recurring gift", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await seed_sub(npo_id);

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
    });

    expect(await sub()).toMatchObject({
      status: "inactive",
      status_cancel_reason: "refunded",
    });
    expect(deactivated()).toHaveLength(1);
  });

  test("a lost stripe dispute leaves it billing", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await seed_sub(npo_id);

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "dispute",
      alert_from: "charge-dispute",
      notice,
    });

    expect(res.status).toBe("reversed");
    expect((await sub()).status).toBe("active");
    expect(deactivated()).toHaveLength(0);
  });
});

describe("reverse_charge — the ops notice of a full reversal", () => {
  const queued = () =>
    enqueue.mock.calls
      .flat()
      .filter((m) => m.id === "fiat-notice")
      .map((m) => m.payload);

  test("a lost dispute reports the reversal", async () => {
    const { id } = await seed("stripe:card");

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "dispute",
      alert_from: "charge-dispute",
      notice,
    });

    const [n, ...rest] = queued();
    expect(rest).toEqual([]);
    expect(n.id).toBe("evt_1_0");
    expect(n.alert.title).toBe("Dispute Lost: Donation Reversed");
    expect(n.alert.body.split("\n")).toEqual([
      ...notice.lines,
      "all 1 dists reversed.",
    ]);
  });

  test("a lost dispute that doesn't finish reports what failed", async () => {
    const { id } = await seed("stripe:card");
    await test_db.current!.db.insert(dists).values({
      id: `dist-${id}-orphan`,
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: null,
      amount_denom: "USD",
      net: 10,
      alloc: { liq: 100, lock: 0, cash: 0 },
    });

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "dispute",
      alert_from: "charge-dispute",
      notice,
    });

    const [n] = queued();
    expect(n.id).toBe("evt_1_1");
    expect(n.alert.title).toBe("Dispute Lost: Reversal Did Not Complete");
    expect(n.alert.body.split("\n").at(-1)).toBe(
      "1 of 2 dists failed to reverse, and the donation stays settled."
    );
  });

  test("a full refund queues no notice of its own", async () => {
    const { id } = await seed("paypal");

    const res = await reverse_charge({
      donation_id: id,
      rail: "paypal",
      source: "refund",
      alert_from: "paypal-refund",
      notice,
    });

    expect(res.status).toBe("reversed");
    expect(queued()).toEqual([]);
  });

  test("a full refund after earlier partials brackets the reversal for ops' hand adjustment", async () => {
    const { id } = await seed("stripe:card");
    const refund = (rid: string, amount: number) =>
      ({ id: rid, amount, status: "succeeded", created: 1 }) as any;

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
      after_partials: {
        seen_at: "charge ch_1, event evt_1",
        currency: "usd",
        completing: refund("re_2", 6000),
        earlier: [refund("re_1", 4000)],
      },
    });

    expect(res.status).toBe("reversed");
    expect(queued().map((n) => [n.id, n.alert.title])).toEqual([
      ["re_2_start", "Full Refund After Partial: Reversal Starting"],
      ["re_2_undo", "Reversal Complete: Undo Hand Adjustment"],
    ]);
  });
});
