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
import {
  donation_donors,
  donation_recipients,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { subscriptions } from "$/pg/schema/subscription";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

// the guard this suite is about is a db row that has to outlive stripe's
// idempotency key, so the db is real: a mocked donation_get would answer from
// whatever the test handed it and prove nothing about what was persisted.
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

/**
 * stands in for stripe's idempotency layer as documented: the result of the
 * first request for a key is saved and replayed to every later request
 * carrying it, so a retry gets back the original object instead of a new one.
 * a request with no key is always a fresh write — which is the bug this
 * suite exists to catch.
 *
 * `forget` drops the saved results, which is what stripe does to keys older
 * than 24h. past that window a redelivery is a fresh write and only the db
 * can stop it.
 *
 * @see https://docs.stripe.com/api/idempotent_requests
 */
const idempotent = <T>(mint: (n: number) => T) => {
  const saved = new Map<string, T>();
  const minted: T[] = [];
  const fn = vi.fn(async (_params: any, opts?: { idempotencyKey?: string }) => {
    const key = opts?.idempotencyKey;
    if (key && saved.has(key)) return saved.get(key)!;
    const obj = mint(minted.length + 1);
    minted.push(obj);
    if (key) saved.set(key, obj);
    return obj;
  });
  return { fn, minted, forget: () => saved.clear() };
};

// the order-row write is the second of two, and only a real failure between
// them shows whether they are one unit. everything else in the module stays
// real — donation_get is what the guard reads back.
const fail_order_write = vi.hoisted(() => ({ current: false }));
vi.mock("$/pg/queries/donation", async (orig) => {
  const real = await orig<typeof import("$/pg/queries/donation")>();
  return {
    ...real,
    donation_update: (...args: Parameters<typeof real.donation_update>) => {
      if (!fail_order_write.current) return real.donation_update(...args);
      fail_order_write.current = false;
      return Promise.reject(new Error("pg unavailable"));
    },
  };
});

const subs = vi.hoisted(() => ({ current: null as any }));
const prices = vi.hoisted(() => ({ current: null as any }));

vi.mock("$/kit/stripe", () => ({
  stripe: {
    subscriptions: { create: (...a: any[]) => subs.current.fn(...a) },
    prices: { create: (...a: any[]) => prices.current.fn(...a) },
  },
}));

// --- imports (after mocks) ---

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_setup_intent_succeeded } from "./setup-intent-succeeded";

// --- setup ---

const ORDER_ID = "order-1";
const SUB_CREATED = 1767225600; // 2026-01-01T00:00:00Z
const PERIOD_END = 1769904000; // 2026-02-01T00:00:00Z

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

/** what stripe hands back from subscriptions.create */
const stripe_sub = (n: number) => ({
  id: `sub_${n}`,
  created: SUB_CREATED,
  items: {
    data: [
      {
        current_period_end: PERIOD_END,
        price: {
          id: `price_${n}`,
          product: "prod_1",
          recurring: { interval: "month", interval_count: 1 },
        },
      },
    ],
  },
});

beforeEach(async () => {
  vi.clearAllMocks();
  fail_order_write.current = false;
  subs.current = idempotent(stripe_sub);
  prices.current = idempotent((n) => ({ id: `price_${n}` }));

  const db = test_db.current!.db;
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(subscriptions);
  await db.delete(npos);

  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-SETUP-INTENT",
      name: "Freegan Food Foundation",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;

  await db.insert(donations).values({
    id: ORDER_ID,
    upusd: 1,
    status: "confirmed",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "monthly",
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
  });
});

const intent = (id: string) => ({
  object: {
    id,
    customer: "cus_1",
    payment_method: "pm_1",
    metadata: { order_id: ORDER_ID },
  },
});

const order_row = () =>
  test_db
    .current!.db.select()
    .from(donations)
    .where(eq(donations.id, ORDER_ID))
    .then((r) => r[0]!);

const sub_rows = () => test_db.current!.db.select().from(subscriptions);

describe("handle_setup_intent_succeeded - redelivery", () => {
  test("a redelivered setup intent leaves the donor on one subscription", async () => {
    await handle_setup_intent_succeeded(intent("seti_1") as any);
    await handle_setup_intent_succeeded(intent("seti_1") as any);

    // two live subscriptions bills the donor twice every period, and nothing
    // downstream would notice
    expect(subs.current.minted).toHaveLength(1);
  });

  test("a redelivered setup intent does not mint a second price", async () => {
    await handle_setup_intent_succeeded(intent("seti_1") as any);
    await handle_setup_intent_succeeded(intent("seti_1") as any);

    expect(prices.current.minted).toHaveLength(1);
  });

  test("the order row records the subscription it was put on", async () => {
    await handle_setup_intent_succeeded(intent("seti_1") as any);

    // the guard below is only as durable as this write. until the first
    // invoice settles nothing else records it on the order row.
    expect((await order_row()).subscription_id).toBe("sub_1");
  });

  test("a redelivery past the idempotency window is stopped by the order row", async () => {
    await handle_setup_intent_succeeded(intent("seti_1") as any);

    // stripe prunes idempotency keys once they are 24h old. a us_bank_account
    // donor's first invoice takes days, so nothing else has written the
    // subscription onto the order by the time a hand redelivery lands.
    subs.current.forget();
    prices.current.forget();

    await handle_setup_intent_succeeded(intent("seti_1") as any);

    expect(subs.current.minted).toHaveLength(1);
  });

  test("a different setup intent still creates its own subscription", async () => {
    await handle_setup_intent_succeeded(intent("seti_1") as any);

    // the first intent's subscription is on the order row now, so a second
    // intent has to be let through by something other than the guard
    await test_db
      .current!.db.update(donations)
      .set({ subscription_id: null })
      .where(eq(donations.id, ORDER_ID));

    await handle_setup_intent_succeeded(intent("seti_2") as any);

    expect(subs.current.minted).toHaveLength(2);
  });
});

describe("handle_setup_intent_succeeded - a half-written pair", () => {
  test("an order-row write that fails takes the subscriptions row with it", async () => {
    fail_order_write.current = true;

    await expect(
      handle_setup_intent_succeeded(intent("seti_1") as any)
    ).rejects.toThrow("pg unavailable");

    // the two writes are one unit. a subscriptions row with nothing pointing
    // at it is a live stripe subscription the order row does not know about,
    // and the guard that stops a second one reads that row.
    expect(await sub_rows()).toHaveLength(0);
  });

  test("the redelivery after that failure lands both writes", async () => {
    fail_order_write.current = true;
    await expect(
      handle_setup_intent_succeeded(intent("seti_1") as any)
    ).rejects.toThrow();

    await handle_setup_intent_succeeded(intent("seti_1") as any);

    // stripe replays the saved subscription for the key, so the donor is on
    // the one that already exists rather than a second one
    expect(subs.current.minted).toHaveLength(1);
    expect(await sub_rows()).toHaveLength(1);
    expect((await order_row()).subscription_id).toBe("sub_1");
  });
});
