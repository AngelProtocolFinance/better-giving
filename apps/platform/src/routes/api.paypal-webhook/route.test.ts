// the "two deliveries race" tests run on pglite, a single connection: two
// db.transaction() calls queue rather than overlap. they prove the guard reads
// committed state under the tx, not that the order row's lock contends.

import { inspect } from "node:util";
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

const { action } = await import("./route");
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
      gross_amount: { value: "100", currency_code: "USD" },
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

  it("settles a capture paypal charged no fee at its gross", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 100, fee: 0 }),
    ]);
  });

  it("takes platform fees out of a net paypal left off the capture", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "USD" } }],
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 94.5, fee: 3.5 }),
    ]);
  });

  it("settles at paypal's net whatever platform fees ride along", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "1.85", currency_code: "EUR" } }],
        net_amount: { value: "94.5", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 94.5, fee: 3.5 }),
    ]);
  });

  it("derives a fallback net to the cent", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "50.00", currency_code: "USD" },
        paypal_fee: { value: "2.24", currency_code: "USD" },
        platform_fees: [{ amount: { value: "0.70", currency_code: "USD" } }],
      },
    };

    await deliver({ ...capture_ev(), resource });

    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 47.06 }),
    ]);
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

  it("asks for redelivery of a settled sale while paypal's api is down", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    get_subscription_mock.mockRejectedValue(new Error("paypal 503"));

    const res = await deliver(sale_ev());

    expect(res.ok).toBe(false);
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(await settlements()).toHaveLength(1);
  });

  it("answers 200 for a settled sale whose subscription has no order id", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    const { custom_id: _, ...sub } = await get_subscription_mock();
    get_subscription_mock.mockResolvedValue(sub);

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).toHaveBeenCalled();
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("asks for redelivery of a sale that lands before its subscription activates", async () => {
    await seed_donation({ frequency: "monthly" });
    const { billing_info: _, ...active } = await get_subscription_mock();
    get_subscription_mock.mockResolvedValue({ ...active, status: "APPROVED" });

    const early = await deliver(sale_ev());

    expect(early.ok).toBe(false);
    expect(await settlements()).toHaveLength(0);
    expect(enqueue_mock).not.toHaveBeenCalled();

    get_subscription_mock.mockResolvedValue({
      ...active,
      status: "ACTIVE",
      billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
    });
    const redelivered = await deliver(sale_ev());

    expect(redelivered.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.settlement!.id).toBe(SALE_ID);
  });

  it("settles a sale paypal charged no fee at its total", async () => {
    await seed_donation({ frequency: "monthly" });
    const { transaction_fee: _, ...resource } = sale_ev().resource;

    const res = await deliver({ ...sale_ev(), resource });

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: SALE_ID, net: 100, fee: 0 }),
    ]);
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

// a non-2xx buys up to 25 redeliveries over 3 days; a payload missing what the
// route needs arrives identical every time, so it is reported and acknowledged
describe("an event no redelivery can route", () => {
  it("acknowledges and reports a capture with no donation id", async () => {
    await seed_donation();
    const { custom_id: _, ...resource } = capture_ev().resource;

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no gross amount", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        net_amount: { value: "96.5", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no net and a platform fee in another currency", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "EUR" } }],
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports an approved order with no donation id", async () => {
    await seed_donation();

    const res = await deliver({
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: {
        id: "ORDER-1",
        payment_source: { paypal: { email_address: "payer@test.com" } },
        purchase_units: [{}],
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect((await donation_get(ORDER_ID))!.from_email).toBe("donor@test.com");
  });

  it("acknowledges and reports an activated subscription with no donation id", async () => {
    await seed_donation({ frequency: "monthly" });

    const res = await deliver({
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: {
        id: SUBS_ID,
        plan_id: "P-1",
        subscriber: { email_address: "subscriber@test.com" },
        billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await db().select().from(subscriptions)).toHaveLength(0);
  });

  it("acknowledges and reports a sale with no subscription id", async () => {
    await seed_donation({ frequency: "monthly" });
    const { billing_agreement_id: _, ...resource } = sale_ev().resource;

    const res = await deliver({ ...sale_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("asks for redelivery of a capture whose donation row is not there yet", async () => {
    const res = await deliver(capture_ev());

    expect(res.ok).toBe(false);
    expect(await settlements()).toHaveLength(0);
  });
});

describe("logging", () => {
  const DONOR = {
    email: "payer-pii@example.com",
    given_name: "Janepii",
    surname: "Payerpii",
    line_1: "742 Piistreet Ave",
  };
  const donor_name = { given_name: DONOR.given_name, surname: DONOR.surname };
  const donor_address = {
    address_line_1: DONOR.line_1,
    admin_area_2: "Springfield",
    postal_code: "12345",
    country_code: "US",
  };
  const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

  let spies: { mock: { calls: unknown[][] } }[];
  beforeEach(() => {
    spies = CONSOLE_METHODS.map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
  });

  /** every console call's and error report's arguments, deeply rendered —
   * inspect reaches an Error's message, cause and own props where JSON drops them */
  const logged_text = () =>
    [...spies, report_error_mock]
      .flatMap((s) => s.mock.calls.flat())
      .map((a) => (typeof a === "string" ? a : inspect(a, { depth: null })))
      .join("\n");

  const expect_no_donor_pii = () => {
    const text = logged_text();
    expect(text).not.toBe("");
    for (const v of Object.values(DONOR)) expect(text).not.toContain(v);
  };

  it("keeps the payer out of the log of an approved order", async () => {
    await seed_donation();

    const res = await deliver({
      id: "WH-1",
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: {
        id: "ORDER-1",
        payment_source: {
          paypal: {
            email_address: DONOR.email,
            name: donor_name,
            address: donor_address,
          },
        },
        purchase_units: [{ custom_id: ORDER_ID }],
      },
    });

    expect(res.status).toBe(200);
    expect_no_donor_pii();
  });

  it("keeps the payer out of the log of a completed capture", async () => {
    await seed_donation();
    get_order_mock.mockResolvedValue({
      id: "ORDER-1",
      payment_source: {
        paypal: {
          email_address: DONOR.email,
          name: donor_name,
          address: donor_address,
        },
      },
    });
    const ev = capture_ev();

    const res = await deliver({
      ...ev,
      id: "WH-4",
      resource: {
        ...ev.resource,
        supplementary_data: { related_ids: { order_id: "ORDER-1" } },
      },
    });

    expect(res.status).toBe(200);
    expect(get_order_mock).toHaveBeenCalledWith("ORDER-1");
    expect((await donation_get(ORDER_ID))!.from_email).toBe(DONOR.email);
    expect_no_donor_pii();
  });

  it("keeps the subscriber out of the log of an activated subscription", async () => {
    await seed_donation({ frequency: "monthly" });

    const res = await deliver({
      id: "WH-3",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: {
        id: SUBS_ID,
        plan_id: "P-1",
        custom_id: ORDER_ID,
        subscriber: {
          email_address: DONOR.email,
          name: donor_name,
          shipping_address: { address: donor_address },
        },
        billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
      },
    });

    expect(res.status).toBe(200);
    expect_no_donor_pii();
  });

  it("keeps the payer out of the log of an unhandled event", async () => {
    const res = await deliver({
      id: "WH-2",
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: {
        id: "REFUND-1",
        payer: {
          email_address: DONOR.email,
          name: donor_name,
          address: donor_address,
        },
      },
    });

    expect(res.status).toBe(201);
    expect(await res.text()).toContain("event type not handled");
    expect_no_donor_pii();
  });
});
