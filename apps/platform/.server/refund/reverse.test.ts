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
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "../pg/schema/donation";
import { forms } from "../pg/schema/form";
import { donation_match_events } from "../pg/schema/match";
import { npos } from "../pg/schema/npo";
import { owed_amounts } from "../pg/schema/owed";
import { payouts } from "../pg/schema/payout";
import { programs } from "../pg/schema/program";
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

import { donation_get } from "../pg/queries/donation";
import { create_test_db } from "../pg/test-utils/pglite";
import { has_settled_dists, reversal_preview, reverse_charge } from "./reverse";

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
  await db.delete(owed_amounts);
  await db.delete(payouts);
  await db.delete(dists);
  await db.delete(donation_match_events);
  await db.delete(donation_settlements);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(forms);
  await db.delete(programs);
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

/** a second dist with no npo, which fails to reverse */
const seed_orphan_dist = (id: string) =>
  test_db.current!.db.insert(dists).values({
    id: `dist-${id}-orphan`,
    donation_id: id,
    status: "settled",
    date_created: "2026-07-01T00:00:00.000Z",
    to_id: null,
    amount_denom: "USD",
    net: 10,
    alloc: { liq: 100, lock: 0, cash: 0 },
  });

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

describe("reverse_charge — a gift through a form, to a program", () => {
  test("takes the gift off the form's and the program's totals", async () => {
    const { id, npo_id } = await seed("stripe:card");
    const db = test_db.current!.db;
    await db.insert(forms).values({
      id: "form-1",
      name: "Form",
      owner_npo_id: npo_id,
      status: "active",
      date_created: "2026-07-01T00:00:00.000Z",
      ltd: 100,
      ltd_count: 1,
    });
    await db.insert(programs).values({
      id: "prog-1",
      npo_id,
      title: "Wells",
      description_pt: "[]",
      total_donations: 100,
    });
    await db
      .update(donations)
      .set({ form_id: "form-1", program_id: "prog-1", program_name: "Wells" })
      .where(eq(donations.id, id));

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
    });

    const [form] = await db.select().from(forms);
    expect([form!.ltd, form!.ltd_count]).toEqual([0, 0]);
    const [prog] = await db.select().from(programs);
    expect(prog!.total_donations).toBe(0);
  });
});

describe("reverse_charge — a gift named by its v1 id", () => {
  test("reverses the gift that id loads", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await test_db
      .current!.db.update(donations)
      .set({ id_v1: `v1-${id}` })
      .where(eq(donations.id, id));

    const res = await reverse_charge({
      donation_id: `v1-${id}`,
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

/** `seed`'s gift reshaped into the ticket's $100 card gift: $90 net, a $3.20
 * card fee and $6.80 of bg fees, its whole net granted in a payout already paid */
async function grant_paid(id: string, npo_id: number) {
  const db = test_db.current!.db;
  await db
    .update(dists)
    .set({
      net: 90,
      fee_base: 4.3,
      fee_fsa: 2.5,
      fee_processing: 3.2,
      alloc: { liq: 0, lock: 0, cash: 100 },
    })
    .where(eq(dists.donation_id, id));
  await db.insert(payouts).values({
    id: `payout-${id}`,
    source_id: `dist-${id}`,
    npo_id,
    source: "donation",
    date: "2026-07-01T00:00:00.000Z",
    amount: 90,
    type: "settled",
    settled_date: "2026-07-02T00:00:00.000Z",
  });
}

const owed_rows = () => test_db.current!.db.select().from(owed_amounts);

describe("reverse_charge — a gift whose grant was already paid", () => {
  test.each([
    ["card", "stripe", "stripe:card"],
    ["ACH", "stripe", "stripe:us_bank_account"],
    ["PayPal", "paypal", "paypal"],
    ["crypto", "crypto", "crypto:eth"],
  ] as const)(
    "%s: a refund records what the npo owes, not a platform loss",
    async (_, rail, via) => {
      const { id, npo_id } = await seed(via);
      await grant_paid(id, npo_id);

      const res = await reverse_charge({
        donation_id: id,
        rail,
        source: "refund",
        alert_from: "test",
        notice,
      });

      expect(res).toMatchObject({ status: "reversed", applied: 1 });
      expect(await owed_rows()).toEqual([
        expect.objectContaining({
          donation_id: id,
          npo_id,
          source: "refund",
          source_ref: "evt_1",
          received_usd: 90,
          fee_processing_usd: 3.2,
          fee_dispute_usd: 0,
          outstanding_usd: 93.2,
        }),
      ]);
      expect(await test_db.current!.db.select().from(loss_logs)).toEqual([]);
    }
  );

  test.each([
    ["dispute", "dispute"],
    ["admin", "refund"],
  ] as const)(
    "a reversal from %s is recorded as a %s",
    async (source, recorded) => {
      const { id, npo_id } = await seed("stripe:card");
      await grant_paid(id, npo_id);

      await reverse_charge({
        donation_id: id,
        rail: "stripe",
        source,
        alert_from: "test",
        notice,
      });

      const [owed] = await owed_rows();
      expect(owed).toMatchObject({ source: recorded, source_ref: "evt_1" });
    }
  );

  test("a reversal naming the provider's refund records it as the source, not the event", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await grant_paid(id, npo_id);

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      source_ref: "re_1",
      alert_from: "test",
      notice,
    });

    const [owed] = await owed_rows();
    expect(owed).toMatchObject({ source: "refund", source_ref: "re_1" });
  });

  test("a gift whose payout is still pending cancels it and owes nothing", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await grant_paid(id, npo_id);
    const db = test_db.current!.db;
    await db
      .update(payouts)
      .set({ type: "pending", settled_date: null })
      .where(eq(payouts.id, `payout-${id}`));
    await db.update(npos).set({ cash: 90 }).where(eq(npos.id, npo_id));

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "test",
      notice,
    });

    expect(res).toMatchObject({ status: "reversed", has_loss: false });
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded");
    expect(await owed_rows()).toEqual([]);
  });
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

  test.each([
    ["stripe", "stripe:card", "refund", "inactive", 1],
    ["stripe", "stripe:card", "admin", "inactive", 1],
    // a lost dispute leaves it billing
    ["stripe", "stripe:card", "dispute", "active", 0],
    ["paypal", "paypal", "refund", "active", 0],
    ["paypal", "paypal", "dispute", "active", 0],
    ["crypto", "crypto:eth", "refund", "active", 0],
  ] as const)(
    "a full %s reversal (%s, %s) leaves the recurring gift %s",
    async (rail, via, source, status, queued) => {
      const { id, npo_id } = await seed(via);
      await seed_sub(npo_id);

      const res = await reverse_charge({
        donation_id: id,
        rail,
        source,
        alert_from: "test",
        notice,
      });

      expect(res.status).toBe("reversed");
      expect((await sub()).status).toBe(status);
      expect(deactivated()).toHaveLength(queued);
    }
  );

  test("a stripe refund of a gift whose subscription already ended still reverses", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await seed_sub(npo_id);
    await test_db
      .current!.db.update(subscriptions)
      .set({ status: "inactive", status_cancel_reason: "user" });

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
    });

    expect(res.status).toBe("reversed");
    expect((await state(id, npo_id)).don).toBe("refunded");
  });

  test("a billing stop that can't be queued reverses nothing, so a redelivery retries both", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await seed_sub(npo_id);
    enqueue.mockRejectedValueOnce(new Error("qstash 503"));
    const full = {
      donation_id: id,
      rail: "stripe",
      source: "refund",
      alert_from: "charge-refunded",
      notice,
    } as const;

    await expect(reverse_charge(full)).rejects.toThrow("qstash 503");
    expect((await state(id, npo_id)).dist).toEqual(["settled", null]);

    expect((await reverse_charge(full)).status).toBe("reversed");
    expect(deactivated()).toHaveLength(2);
  });

  test("a stripe refund whose reversal doesn't finish still stops the billing", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await seed_sub(npo_id);
    await seed_orphan_dist(id);

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "admin",
      alert_from: "refund-action",
      notice,
    });

    expect(res).toMatchObject({ status: "failed", reason: "incomplete" });
    expect((await sub()).status).toBe("inactive");
    expect(deactivated()).toHaveLength(1);
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
    await seed_orphan_dist(id);

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

  test("a lost dispute on a paid grant says what the npo owes", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await grant_paid(id, npo_id);

    await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "dispute",
      alert_from: "charge-dispute",
      notice,
    });

    const [n] = queued();
    expect(n.alert.body.split("\n").at(-1)).toMatch(
      new RegExp(
        `^owed: \\$93\\.20 recorded as owed by Test NPO ${counter} \\(npo ${npo_id}\\)`
      )
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

  const after_partials = {
    seen_at: "charge ch_1, event evt_1",
    currency: "usd",
    completing: { id: "re_2", amount: 6000, status: "succeeded", created: 1 },
    earlier: [{ id: "re_1", amount: 4000, status: "succeeded", created: 1 }],
  } as any;

  test("a full refund after earlier partials that doesn't finish tells ops to keep their hand adjustment", async () => {
    const { id } = await seed("stripe:card");
    await seed_orphan_dist(id);

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "admin",
      alert_from: "refund-action",
      notice,
      after_partials,
    });

    expect(res).toMatchObject({ status: "failed", reason: "incomplete" });
    const [, keep] = queued();
    expect(keep.id).toBe("re_2_keep");
    expect(keep.alert.title).toBe(
      "Reversal Did Not Complete: Keep Hand Adjustment"
    );
    expect(keep.alert.body).toContain("1 of 2 dists failed to reverse");
  });

  test("a closing notice that can't be queued is reported with its instruction, the reversal standing", async () => {
    const { id } = await seed("stripe:card");
    enqueue
      .mockResolvedValueOnce(undefined) // the start notice
      .mockRejectedValueOnce(new Error("qstash 503"));

    const res = await reverse_charge({
      donation_id: id,
      rail: "stripe",
      source: "admin",
      alert_from: "refund-action",
      notice,
      after_partials,
    });

    expect(res.status).toBe("reversed");
    expect(report_error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "qstash 503" }),
      expect.objectContaining({
        donation_id: id,
        title: "Reversal Complete: Undo Hand Adjustment",
      })
    );
  });
});

describe("has_settled_dists — whether a reversal has anything to take back", () => {
  test("a distributed gift has", async () => {
    const { id } = await seed("stripe:card");

    expect(await has_settled_dists(id)).toBe(true);
  });

  test("a gift not distributed yet hasn't", async () => {
    const { id } = await seed("stripe:card");
    await test_db.current!.db.delete(dists).where(eq(dists.donation_id, id));

    expect(await has_settled_dists(id)).toBe(false);
  });
});

describe("reversal_preview — what an admin refund would reverse", () => {
  test("lists a settled gift's dists in usd with what reversing each does", async () => {
    const { id, npo_id } = await seed("stripe:card");
    const don = (await donation_get(id))!;

    const preview = await reversal_preview(don, null);

    expect(preview).toEqual({
      dists: [
        {
          id: `dist-${id}`,
          npo_id,
          npo_name: `Test NPO ${counter}`,
          amount: 100,
          net: 100,
          refund_status: null,
          refund_error: null,
          owed: 0,
          effects: [
            expect.objectContaining({ label: "Savings balance", pass: true }),
          ],
          blockers: [],
          warnings: [],
        },
      ],
      total_loss: 0,
    });
    // a preview writes nothing
    expect((await state(id, npo_id)).dist).toEqual(["settled", null]);
  });

  test("a paid grant previews what its npo would owe, not a platform loss", async () => {
    const { id, npo_id } = await seed("stripe:card");
    await grant_paid(id, npo_id);
    const don = (await donation_get(id))!;

    const preview = await reversal_preview(don, null);

    expect(preview.dists).toEqual([
      expect.objectContaining({ npo_id, amount: 100, net: 90, owed: 93.2 }),
    ]);
    expect(preview.total_loss).toBe(0);
    expect(await owed_rows()).toEqual([]);
  });

  test("lists nothing for a gift not distributed yet", async () => {
    const { id } = await seed("stripe:card");
    await test_db.current!.db.delete(dists).where(eq(dists.donation_id, id));
    const don = (await donation_get(id))!;

    expect(await reversal_preview(don, null)).toEqual({
      dists: [],
      total_loss: 0,
    });
  });
});
