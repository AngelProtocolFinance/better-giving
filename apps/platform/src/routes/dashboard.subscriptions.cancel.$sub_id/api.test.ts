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

const enqueue_mock = vi.hoisted(() => vi.fn());
const construct_event_mock = vi.hoisted(() => vi.fn());
const sub_retrieve_mock = vi.hoisted(() => vi.fn());
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("#/.server/auth", () => ({ user_ctx: "user_ctx" }));
vi.mock("#/.server/toast", () => ({
  redirectWithSuccess: () => new Response(null, { status: 302 }),
}));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: construct_event_mock },
    subscriptions: { retrieve: sub_retrieve_mock },
  },
}));
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

const { action: cancel, loader } = await import("./api");
const { action: webhook } = await import("#/routes/api.stripe-webhook/route");
const { FIRST_PAYMENT_INCOMPLETE } = await import("@/subscriptions");
const { sub_get } = await import("$/pg/queries/subscription");
const { subscriptions } = await import("$/pg/schema/subscription");
const { npos } = await import("$/pg/schema/npo");
const { seed_npo } = await import("#/__tests__/fixtures/funds");

const SUB_ID = "sub_incomplete";
const DONOR = "ada@test.com";

const post_cancel = (body: string, email = DONOR) =>
  cancel({
    context: { get: () => ({ email }) },
    params: { sub_id: SUB_ID },
    request: new Request("https://x/cancel", { method: "POST", body }),
  } as any);

const donor_cancels = (reason: unknown, email = DONOR) =>
  post_cancel(JSON.stringify({ reason }), email);

const stripe_reports = (status: string) => {
  const sub = {
    id: SUB_ID,
    object: "subscription",
    status,
    items: { data: [{ current_period_end: 1790812800 }] },
  };
  construct_event_mock.mockReturnValue({
    type: "customer.subscription.updated",
    data: { object: sub },
  });
  sub_retrieve_mock.mockResolvedValue(sub);
  return webhook({
    request: new Request("https://x/api/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=ok" },
    }),
  } as any) as Promise<Response>;
};

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(subscriptions);
  await db.delete(npos);
  const npo = await seed_npo(db);
  await db.insert(subscriptions).values({
    id: SUB_ID,
    interval: "month",
    interval_count: 1,
    next_billing: "2026-10-01T00:00:00.000Z",
    amount: 10,
    amount_usd: 10,
    currency: "usd",
    product_id: "prod_1",
    to_npo_id: npo!.id,
    to_name: "Fund Test NPO",
    platform: "stripe",
    status: "inactive",
    status_cancel_reason: FIRST_PAYMENT_INCOMPLETE,
    from_id: DONOR,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });
});

describe("donor cancels a gift whose first payment is still incomplete", () => {
  it("queues the stripe cancel with the donor's reason", async () => {
    await donor_cancels("changed my mind");

    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: { id: SUB_ID, status_cancel_reason: "changed my mind" },
    });
  });

  // the handler undoes only a cancel the donor was told went through
  it("marks the queued cancel as the donor's own", async () => {
    await donor_cancels("changed my mind");

    expect(enqueue_mock.mock.calls[0]![0].payload.by_donor).toBe(true);
  });

  it("stays cancelled when the first payment lands afterwards", async () => {
    await donor_cancels("changed my mind");

    const res = await stripe_reports("active");

    expect(res.status).toBe(200);
    const row = await sub_get(SUB_ID);
    expect(row?.status).toBe("inactive");
    expect(row?.status_cancel_reason).toBe("changed my mind");
  });
});

describe("the donor behind a gift", () => {
  it("is matched on their address whatever its case", async () => {
    const email = "Ada@Test.com";
    await expect(
      loader({
        context: { get: () => ({ email }) },
        params: { sub_id: SUB_ID },
      } as any)
    ).resolves.toEqual({ recipient_name: "Fund Test NPO" });

    const res = await donor_cancels("moving abroad", email);

    expect(res.status).toBe(302);
    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe("moving abroad");
  });

  it("is told a body that isn't json is bad, and nothing is cancelled", async () => {
    await expect(post_cancel("reason=moving")).rejects.toMatchObject({
      init: { status: 400 },
    });
    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe(
      FIRST_PAYMENT_INCOMPLETE
    );
  });

  it.each([
    ["blank", "   "],
    ["not text", { drop: "table" }],
    ["past 500 characters", "x".repeat(501)],
  ])(
    "is refused a reason that is %s, and nothing is cancelled",
    async (_, reason) => {
      await expect(donor_cancels(reason)).rejects.toMatchObject({
        init: { status: 400 },
      });
      expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe(
        FIRST_PAYMENT_INCOMPLETE
      );
    }
  );

  it("keeps a reason trimmed", async () => {
    await donor_cancels("  moving abroad \n");
    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe("moving abroad");
  });
});
