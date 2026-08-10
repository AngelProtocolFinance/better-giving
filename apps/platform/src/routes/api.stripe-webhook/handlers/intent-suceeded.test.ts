import { eq, ne } from "drizzle-orm";
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
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { subscriptions } from "$/pg/schema/subscription";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

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

// the donation rows, the settlement records and the branch decision between
// them all run against real postgres: what a redelivery must not do is write a
// second row, and only the db can show that.
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn() },
  paymentMethods: { retrieve: vi.fn() },
  invoicePayments: { list: vi.fn() },
}));
vi.mock("$/kit/stripe", () => ({ stripe }));

// enqueue is a live qstash call whose client needs credentials this suite has
// none of. the dist, npo credit and payout a duplicate would mint are all
// downstream of these msgs, so handing them over twice is the observable fault.
const enqueue = vi.hoisted(() => vi.fn(async (..._msgs: unknown[]) => {}));
vi.mock("$/kit/queue", () => ({ enqueue }));

// --- imports (after mocks) ---

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_intent_succeeded } from "./intent-suceeded";

// --- setup ---

const ORDER_ID = "order-1";
const SUBS_ID = "sub_1";
const INVOICE_DATE = 1767225600; // 2026-01-01T00:00:00Z
// every donor here names an employer, so `don-match` is queued whenever the
// handler decides the charge is eligible for one. without it the match
// decision is unobservable — settle_msgs drops the msg on an empty name and
// every path looks identical no matter which way the flag went.
const EMPLOYER = "Northwind Traders";
const DIST_RECEIPT = ["don-sttl-dist", "don-sttl-receipt"];
const DIST_RECEIPT_MATCH = [...DIST_RECEIPT, "don-match"];

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(donation_settlements);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(subscriptions);
  await db.delete(npos);

  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-STRIPE-REBILL",
      name: "Freegan Food Foundation",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;

  stripe.paymentIntents.retrieve.mockResolvedValue({
    latest_charge: { balance_transaction: { net: 9500, fee: 500 } },
  });
  stripe.paymentMethods.retrieve.mockResolvedValue({ type: "card" });
  stripe.invoicePayments.list.mockResolvedValue({
    data: [
      {
        invoice: {
          created: INVOICE_DATE,
          deleted: false,
          parent: {
            subscription_details: {
              metadata: { order_id: ORDER_ID },
              subscription: SUBS_ID,
            },
          },
        },
      },
    ],
  });
});

/** the order row before any charge cleared */
async function seed_confirmed_order(o: { frequency?: string } = {}) {
  const db = test_db.current!.db;
  await db.insert(donations).values({
    id: ORDER_ID,
    upusd: 1,
    status: "confirmed",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: (o.frequency ?? "one-time") as any,
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_recipients).values({
    donation_id: ORDER_ID,
    npo_id,
    name: "Freegan Food Foundation",
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: ORDER_ID,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: EMPLOYER,
  });
}

/** the row donations.subscription_id points at */
async function seed_subscription() {
  await test_db.current!.db.insert(subscriptions).values({
    id: SUBS_ID,
    interval: "month",
    interval_count: 1,
    next_billing: "2026-02-01T00:00:00.000Z",
    amount: 100,
    amount_usd: 100,
    currency: "USD",
    product_id: "prod_1",
    to_npo_id: npo_id,
    to_name: "Freegan Food Foundation",
    platform: "stripe",
    status: "active",
    from_id: "donor@test.com",
    created_at: "2025-12-01T00:00:00.000Z",
    updated_at: "2025-12-01T00:00:00.000Z",
  });
}

/** the subscription's original donation, already settled once */
async function seed_settled_order() {
  const db = test_db.current!.db;
  await db.insert(subscriptions).values({
    id: SUBS_ID,
    interval: "month",
    interval_count: 1,
    next_billing: "2026-02-01T00:00:00.000Z",
    amount: 100,
    amount_usd: 100,
    currency: "USD",
    product_id: "prod_1",
    to_npo_id: npo_id,
    to_name: "Freegan Food Foundation",
    platform: "stripe",
    status: "active",
    from_id: "donor@test.com",
    created_at: "2025-12-01T00:00:00.000Z",
    updated_at: "2025-12-01T00:00:00.000Z",
  });
  await db.insert(donations).values({
    id: ORDER_ID,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "monthly",
    source: "bg-marketplace",
    via: "stripe:card",
    subscription_id: SUBS_ID,
  });
  await db.insert(donation_recipients).values({
    donation_id: ORDER_ID,
    npo_id,
    name: "Freegan Food Foundation",
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: ORDER_ID,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: EMPLOYER,
  });
  await db.insert(donation_settlements).values({
    donation_id: ORDER_ID,
    sttl_id: "pi_first",
    date: "2025-12-01T00:00:00.000Z",
    currency: "USD",
    net: 95,
    fee: 5,
  });
}

/** empty metadata routes the handler through the invoice lookup */
const intent = (id: string) => ({
  object: { id, created: INVOICE_DATE, payment_method: "pm_1", metadata: {} },
});

/** metadata carrying an order_id is what marks an intent one-time */
const onetime_intent = (id: string) => ({
  object: {
    id,
    created: INVOICE_DATE,
    payment_method: "pm_1",
    metadata: { order_id: ORDER_ID },
  },
});

const kinds_of = (call: unknown[]) => call.map((m: any) => m.id);

const all_donations = () => test_db.current!.db.select().from(donations);
const settlements_for = (sttl_id: string) =>
  test_db
    .current!.db.select()
    .from(donation_settlements)
    .where(eq(donation_settlements.sttl_id, sttl_id));

describe("handle_intent_succeeded - rebill redelivery", () => {
  test("a redelivered rebill intent writes one donation, not two", async () => {
    await seed_settled_order();

    await handle_intent_succeeded(intent("pi_rebill") as any);
    await handle_intent_succeeded(intent("pi_rebill") as any);

    // the order row plus exactly one rebill clone. a second clone is a second
    // dist, a second npo credit and a second payout for one charge.
    const rows = await all_donations();
    expect(rows).toHaveLength(2);
    expect(await settlements_for("pi_rebill")).toHaveLength(1);
  });

  test("a redelivered rebill intent re-queues the same msgs rather than dropping them", async () => {
    await seed_settled_order();

    await handle_intent_succeeded(intent("pi_rebill") as any);
    await handle_intent_succeeded(intent("pi_rebill") as any);

    // every kind here absorbs a duplicate downstream — dist on
    // unique(donation_id,to_id), the receipt on its claim — so re-queueing
    // costs nothing, while dropping costs the donation its dist and receipt
    // whenever the first enqueue was what failed.
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(kinds_of(enqueue.mock.calls[0]!)).toEqual(
      kinds_of(enqueue.mock.calls[1]!)
    );
  });

  test("a rebill recovery never queues an employer filing pack", async () => {
    await seed_settled_order();

    await handle_intent_succeeded(intent("pi_rebill") as any);
    await handle_intent_succeeded(intent("pi_rebill") as any);

    // the settlement lands on a clone, not the order row, which is what marks
    // this a rebill — and rebills are excluded from employer matching. get the
    // test wrong and every monthly subscriber who named an employer is mailed
    // a filing pack every month, with `don-match` retrying until it lands.
    expect(kinds_of(enqueue.mock.calls[0]!)).toEqual(DIST_RECEIPT);
    expect(kinds_of(enqueue.mock.calls[1]!)).toEqual(DIST_RECEIPT);
  });

  test("a redelivery re-queues the msgs a failed enqueue never sent", async () => {
    await seed_settled_order();

    // the tx has committed by the time enqueue runs. a qstash 5xx or a
    // function timeout here leaves a settled donation with no dist row, no npo
    // credit, no payout and no receipt — and the redelivery below is the only
    // thing that can still fix it.
    enqueue.mockRejectedValueOnce(new Error("qstash unavailable"));
    await expect(
      handle_intent_succeeded(intent("pi_rebill") as any)
    ).rejects.toThrow("qstash unavailable");

    await handle_intent_succeeded(intent("pi_rebill") as any);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(kinds_of(enqueue.mock.calls[1]!)).toEqual(DIST_RECEIPT);
    // and still only one rebill row for the one charge
    expect(await all_donations()).toHaveLength(2);
    expect(await settlements_for("pi_rebill")).toHaveLength(1);
  });
});

describe("handle_intent_succeeded - one-time redelivery", () => {
  test("a redelivered one-time intent settles once and re-queues its msgs", async () => {
    await seed_confirmed_order();

    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);
    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);

    const rows = await all_donations();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("settled");
    expect(await settlements_for("pi_onetime")).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(kinds_of(enqueue.mock.calls[1]!)).toEqual(
      kinds_of(enqueue.mock.calls[0]!)
    );
  });

  test("a one-time recovery still queues the filing pack", async () => {
    await seed_confirmed_order();

    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);
    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);

    // the settlement is on the order row itself — the charge that opened the
    // donation, which is exactly the one employer matching is for. a recovery
    // that dropped it would cost the donor the pack whenever the first
    // delivery's enqueue was what failed.
    expect(kinds_of(enqueue.mock.calls[0]!)).toEqual(DIST_RECEIPT_MATCH);
    expect(kinds_of(enqueue.mock.calls[1]!)).toEqual(DIST_RECEIPT_MATCH);
  });
});

describe("handle_intent_succeeded - first-recurring redelivery", () => {
  test("a redelivered first invoice does not clone the order into a rebill", async () => {
    await seed_confirmed_order({ frequency: "monthly" });
    await seed_subscription();

    await handle_intent_succeeded(intent("pi_first") as any);
    // the first delivery set prior.settlement, which is what the rebill branch
    // keys off — without the guard the redelivery reads it as month two
    await handle_intent_succeeded(intent("pi_first") as any);

    const rows = await all_donations();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subscription_id).toBe(SUBS_ID);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  test("a first-recurring recovery still queues the filing pack", async () => {
    await seed_confirmed_order({ frequency: "monthly" });
    await seed_subscription();

    await handle_intent_succeeded(intent("pi_first") as any);
    await handle_intent_succeeded(intent("pi_first") as any);

    // the charge that opened the subscription is the one that earns the pack;
    // the months after it are rebills and get none. the recovery has to tell
    // the two apart from the row it re-reads, and this is the side that must
    // not lose it.
    expect(kinds_of(enqueue.mock.calls[0]!)).toEqual(DIST_RECEIPT_MATCH);
    expect(kinds_of(enqueue.mock.calls[1]!)).toEqual(DIST_RECEIPT_MATCH);
  });
});

describe("handle_intent_succeeded - recovery onto a reversed donation", () => {
  test("a redelivery after a refund re-queues nothing", async () => {
    await seed_confirmed_order();
    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);

    // the donor got the money back between the two deliveries. the settle
    // path refuses to write over a reversed donation; the recovery path has
    // to refuse the same thing, or the redelivery hands the npo a dist and
    // the donor a receipt for a gift that no longer exists.
    await test_db
      .current!.db.update(donations)
      .set({ status: "refunded" })
      .where(eq(donations.id, ORDER_ID));

    await handle_intent_succeeded(onetime_intent("pi_onetime") as any);

    expect(enqueue).toHaveBeenCalledOnce();
  });

  test("a rebill clone a refund reversed is not re-queued either", async () => {
    await seed_settled_order();
    await handle_intent_succeeded(intent("pi_rebill") as any);

    // the clone is the row this charge settled, so it is the one whose status
    // decides — the order row it was cloned from says nothing about it.
    await test_db
      .current!.db.update(donations)
      .set({ status: "refunded" })
      .where(ne(donations.id, ORDER_ID));

    await handle_intent_succeeded(intent("pi_rebill") as any);

    expect(enqueue).toHaveBeenCalledOnce();
  });
});
