// the "two deliveries race" tests run on pglite, a single connection: two
// db.transaction() calls queue rather than overlap. they prove the guard reads
// committed state under the tx, not that the order row's lock contends.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const enqueue_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const get_order_mock = vi.hoisted(() => vi.fn());
const get_subscription_mock = vi.hoisted(() => vi.fn());
const get_plan_mock = vi.hoisted(() => vi.fn());
/** runs on the lock's own tx just before it is taken — a write that commits
 * between the handler's first read and the lock */
const before_lock = vi.hoisted(() => ({
  current: null as null | ((tx: any, id: string) => Promise<void>),
}));

// the route verifies a real paypal signature against a downloaded cert; the
// bytes are paypal's, not this route's logic, so the verifier is stubbed true
vi.mock("node:crypto", async (io) => {
  const actual = await io<typeof import("node:crypto")>();
  const patched = {
    ...actual,
    createVerify: () => ({ update: () => {}, verify: () => true }),
  };
  return { ...patched, default: patched };
});

vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_resp: (e: any) => new Response(e?.message ?? "error", { status: 500 }),
}));
vi.mock("$/env", () => ({
  paypal: {
    webhook_id: "wh-1",
    client_id: "c",
    client_secret: "s",
    api_url: "https://paypal.test",
  },
  stage: "production",
}));
vi.mock("$/kit/paypal", () => ({
  paypal: {
    get_order: get_order_mock,
    get_subscription: get_subscription_mock,
    get_plan: get_plan_mock,
  },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/pg/queries/donation", async (io) => {
  const actual = await io<typeof import("$/pg/queries/donation")>();
  return {
    ...actual,
    donation_settle_state_locked: async (tx: any, id: string) => {
      await before_lock.current?.(tx, id);
      return actual.donation_settle_state_locked(tx, id);
    },
  };
});
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

const { action } = await import("./api.paypal-webhook");
const { donation_get, donation_put, donation_update } = await import(
  "$/pg/queries/donation"
);
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { dists } = await import("$/pg/schema/dist");
const {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} = await import("$/pg/schema/donation");
const { npos } = await import("$/pg/schema/npo");
const { subscriptions } = await import("$/pg/schema/subscription");

const db = () => test_db.current!.db;

const ORDER_ID = "don-pp-1";
const CAPTURE_ID = "capture-1";
const SALE_ID = "sale-1";
const SUBS_ID = "I-SUBS-1";

const deliver = (ev: Record<string, unknown>) =>
  action({
    request: new Request("https://x/api/paypal-webhook", {
      method: "POST",
      body: JSON.stringify(ev),
      headers: {
        "paypal-transmission-id": "t-1",
        "paypal-transmission-time": "2026-01-01T00:00:00Z",
        "paypal-cert-url": "https://paypal.test/cert.pem",
        "paypal-transmission-sig": Buffer.from("sig").toString("base64"),
      },
    }),
  } as any) as Promise<Response>;

const capture_ev = () => ({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: CAPTURE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    custom_id: ORDER_ID,
    seller_receivable_breakdown: {
      net_amount: { value: "96.5", currency_code: "USD" },
      paypal_fee: { value: "3.5" },
    },
  },
});

const sale_ev = () => ({
  event_type: "PAYMENT.SALE.COMPLETED",
  resource: {
    id: SALE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    billing_agreement_id: SUBS_ID,
    transaction_fee: { value: "3.5" },
    amount: { total: "100", currency: "USD" },
  },
});

let npo_id: number;

const seed_donation = async (o: Record<string, unknown> = {}) => {
  const now = "2026-01-01T00:00:00.000Z";
  await donation_put(
    db() as any,
    {
      id: ORDER_ID,
      upusd: 1,
      status: "intent",
      amount: { base: 100, tip: 0, fee_allowance: 0 },
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "paypal",
      to_id: npo_id.toString(),
      to_name: "PP Test NPO",
      to_type: "npo",
      to_tip_allowed: false,
      to_members: [],
      from_email: "donor@test.com",
      from_name: "Jane Donor",
      created_at: now,
      updated_at: now,
      ...o,
    } as any
  );
};

/** the row `settle_npo` inserts once a settle's distribution message lands */
const seed_dist = async (donation_id: string) => {
  await db()
    .insert(dists)
    .values({
      id: `dist-${donation_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-01-02T00:00:00.000Z",
      to_id: npo_id,
      amount_denom: "USD",
      net: 96.5,
    });
};

const settlements = () => db().select().from(donation_settlements);
/** the queue's dedupe keys of the nth enqueue — what makes a re-send a no-op */
const dedupes = (nth: number): string[] =>
  enqueue_mock.mock.calls.at(nth)!.map((m: any) => m.dedupe);
const all_kinds = () =>
  enqueue_mock.mock.calls.flat().map((m: any) => m.id as string);

beforeAll(async () => {
  test_db.current = await create_test_db();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("cert"))
  );
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  before_lock.current = null;
  get_subscription_mock.mockResolvedValue({
    id: SUBS_ID,
    plan_id: "P-1",
    custom_id: ORDER_ID,
    create_time: "2026-01-01T00:00:00.000Z",
    update_time: "2026-01-01T00:00:00.000Z",
    subscriber: { email_address: "donor@test.com", name: { given_name: "J" } },
    billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
  });
  get_plan_mock.mockResolvedValue({
    id: "P-1",
    product_id: "PROD-1",
    billing_cycles: [
      { frequency: { interval_unit: "MONTH", interval_count: 1 } },
    ],
  });

  await db().delete(dists);
  await db().delete(donation_settlements);
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(subscriptions);
  await db().delete(npos);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-PP-TEST",
      name: "PP Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      active: true,
      allocation: { liq: 0, lock: 0, cash: 100 },
    })
    .returning();
  npo_id = npo!.id;
});

describe("PAYMENT.CAPTURE.COMPLETED", () => {
  it("settles one capture once when two deliveries race", async () => {
    await seed_donation();

    const [a, b] = await Promise.all([
      deliver(capture_ev()),
      deliver(capture_ev()),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const bodies = [await a.text(), await b.text()];
    expect(bodies.filter((t) => t === "already processed")).toHaveLength(1);

    expect(await settlements()).toHaveLength(1);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.settlement!.id).toBe(CAPTURE_ID);
    // the loser recomputes the winner's messages — same dedupe keys, so qstash
    // drops the repeat
    expect(dedupes(1)).toEqual(dedupes(0));
    expect(all_kinds()).toEqual([
      "don-sttl-dist",
      "don-sttl-receipt",
      "don-sttl-dist",
      "don-sttl-receipt",
    ]);
  });

  it("re-queues a settled capture's messages on redelivery", async () => {
    await seed_donation();
    await deliver(capture_ev());
    enqueue_mock.mockClear();

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(all_kinds()).toEqual(["don-sttl-dist", "don-sttl-receipt"]);
  });

  it("leaves a donation refunded before the lock unsettled", async () => {
    await seed_donation();
    before_lock.current = async (tx, id) => {
      await donation_update(tx, id, { status: "refunded" });
    };

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(await settlements()).toHaveLength(0);
    expect((await donation_get(ORDER_ID))!.status).toBe("refunded");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("re-queues the receipt when the distribution landed and it did not", async () => {
    await seed_donation();
    await deliver(capture_ev());
    await seed_dist(ORDER_ID);
    enqueue_mock.mockClear();

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(all_kinds()).toContain("don-sttl-receipt");
  });
});

describe("PAYMENT.SALE.COMPLETED", () => {
  it("re-queues a settled sale's messages on redelivery", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(all_kinds()).toEqual(["don-sttl-dist", "don-sttl-receipt"]);
  });

  it("answers 200 for a settled sale while paypal's api is down", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    get_subscription_mock.mockRejectedValue(new Error("paypal 503"));

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).toHaveBeenCalled();
    expect(await settlements()).toHaveLength(1);
  });

  it("settles one first-recurring sale once when two deliveries race", async () => {
    await seed_donation({ frequency: "monthly" });

    const [a, b] = await Promise.all([deliver(sale_ev()), deliver(sale_ev())]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await settlements()).toHaveLength(1);
    expect(await db().select().from(donations)).toHaveLength(1);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.settlement!.id).toBe(SALE_ID);
    expect(all_kinds()).toEqual([
      "don-sttl-dist",
      "don-sttl-receipt",
      "don-sttl-dist",
      "don-sttl-receipt",
    ]);
  });
});
