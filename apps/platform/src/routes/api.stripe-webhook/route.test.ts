import { eq } from "drizzle-orm";
import Stripe from "stripe";
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

const construct_event_mock = vi.hoisted(() => vi.fn());
const sub_retrieve_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const intent_succeeded_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());
const refund_failed_mock = vi.hoisted(() => vi.fn());
const dispute_created_mock = vi.hoisted(() => vi.fn());
const dispute_closed_mock = vi.hoisted(() => vi.fn());
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: construct_event_mock },
    subscriptions: { retrieve: sub_retrieve_mock },
  },
}));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
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
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("./handlers", () => ({
  handle_charge_refunded: vi.fn(),
  handle_intent_failed: vi.fn(),
  handle_intent_requires_action: vi.fn(),
  handle_setup_intent_failed: vi.fn(),
  handle_setup_intent_succeeded: vi.fn(),
  handle_refund_failed: refund_failed_mock,
  handle_dispute_created: dispute_created_mock,
  handle_dispute_closed: dispute_closed_mock,
}));
vi.mock("./handlers/intent-suceeded", () => ({
  handle_intent_succeeded: intent_succeeded_mock,
}));
vi.mock("./handlers/subscription-created", async (orig) => ({
  ...(await orig<typeof import("./handlers/subscription-created")>()),
  handle_subscription_created: vi.fn(),
}));

const { action } = await import("./route");
const { BalanceTxnNotReadyError } = await import("./helpers/settled");
const { FIRST_PAYMENT_INCOMPLETE } = await import(
  "./handlers/subscription-created"
);
const { sub_get } = await import("$/pg/queries/subscription");
const { subscriptions } = await import("$/pg/schema/subscription");
const { npos } = await import("$/pg/schema/npo");
const { seed_npo } = await import("#/__tests__/fixtures/funds");

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("https://x/api/stripe-webhook", {
    method: "POST",
    body,
    headers,
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api.stripe-webhook action", () => {
  it("returns 400 and reports when the signature doesn't verify", async () => {
    construct_event_mock.mockImplementation(() => {
      throw new Stripe.errors.StripeSignatureVerificationError(
        "t=0,v1=deadbeef",
        '{"ping":1}',
        {
          message:
            "No signatures found matching the expected signature for payload",
        }
      );
    });

    const res = await invoke(
      post('{"ping":1}', { "stripe-signature": "t=0,v1=deadbeef" })
    );

    expect(res.status).toBe(400);
    expect(report_error_mock).toHaveBeenCalledOnce();
    // the prefix is what separates the dedicated branch from the generic 400
    // fallback below it, whose body is the raw error message
    await expect(res.text()).resolves.toMatch(
      /^stripe signature verification failed: No signatures found/
    );
  });

  it("returns 403 without verifying when the signature header is absent", async () => {
    const res = await invoke(post('{"ping":1}'));

    expect(res.status).toBe(403);
    expect(construct_event_mock).not.toHaveBeenCalled();
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("returns 503 unreported when the balance txn isn't ready yet", async () => {
    construct_event_mock.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1" } },
    });
    intent_succeeded_mock.mockRejectedValue(
      new BalanceTxnNotReadyError("pi_1")
    );

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(503);
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it.each([
    ["rate limit", new Stripe.errors.StripeRateLimitError({ message: "429" })],
    ["api", new Stripe.errors.StripeAPIError({ message: "500" })],
    [
      "connection",
      new Stripe.errors.StripeConnectionError({ message: "reset" }),
    ],
  ])(
    "returns 503 unreported on a transient stripe %s error",
    async (_, err) => {
      construct_event_mock.mockReturnValue({
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1" } },
      });
      sub_retrieve_mock.mockRejectedValue(err);

      const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

      expect(res.status).toBe(503);
      expect(report_error_mock).not.toHaveBeenCalled();
    }
  );

  it("returns 200 for a verified event it handles", async () => {
    construct_event_mock.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_2" } },
    });
    intent_succeeded_mock.mockResolvedValue(undefined);

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(200);
    expect(intent_succeeded_mock).toHaveBeenCalledOnce();
  });

  it("hands a failed refund to its handler", async () => {
    const event = { type: "refund.failed", data: { object: { id: "re_1" } } };
    construct_event_mock.mockReturnValue(event);

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(200);
    expect(refund_failed_mock).toHaveBeenCalledWith(event);
  });

  it.each([
    ["charge.dispute.created", dispute_created_mock],
    ["charge.dispute.closed", dispute_closed_mock],
  ])("hands %s to its handler", async (type, handler) => {
    const event = { type, data: { object: { id: "dp_1" } } };
    construct_event_mock.mockReturnValue(event);

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(event);
  });
});

describe("customer.subscription lifecycle", () => {
  const SUB_ID = "sub_renewal";
  const STALE_END = "2026-09-01T00:00:00.000Z";
  const LIVE_END_UNIX = 1790812800;
  const LIVE_END = "2026-10-01T00:00:00.000Z";
  const PAYLOAD_END_UNIX = 1_700_000_000;

  beforeEach(async () => {
    const db = test_db.current!.db;
    await db.delete(subscriptions);
    await db.delete(npos);
    const npo = await seed_npo(db);
    await db.insert(subscriptions).values({
      id: SUB_ID,
      interval: "month",
      interval_count: 1,
      next_billing: STALE_END,
      amount: 10,
      amount_usd: 10,
      currency: "usd",
      product_id: "prod_1",
      to_npo_id: npo!.id,
      to_name: "Fund Test NPO",
      platform: "stripe",
      status: "active",
      from_id: "ada@test.com",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    });
  });

  const sub_obj = (status: string, period_end = LIVE_END_UNIX) => ({
    id: SUB_ID,
    object: "subscription",
    status,
    items: { data: [{ current_period_end: period_end }] },
  });

  /** payload carries `payload_status`; a live re-fetch returns `live_status` */
  const deliver = async (payload_status: string, live_status: string) => {
    construct_event_mock.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: sub_obj(payload_status, PAYLOAD_END_UNIX) },
    });
    sub_retrieve_mock.mockImplementation(async (id: string) => {
      if (id !== SUB_ID) throw new Error(`No such subscription: '${id}'`);
      return sub_obj(live_status);
    });
    return invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));
  };

  const set_row = (values: Partial<typeof subscriptions.$inferInsert>) =>
    test_db
      .current!.db.update(subscriptions)
      .set(values)
      .where(eq(subscriptions.id, SUB_ID));

  it("past_due keeps the gift active and refreshes next billing", async () => {
    const res = await deliver("past_due", "past_due");

    expect(res.status).toBe(200);
    const row = await sub_get(SUB_ID);
    expect(row?.status).toBe("active");
    expect(row?.next_billing).toBe(LIVE_END);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("unpaid deactivates the gift and queues the stripe cancel", async () => {
    const res = await deliver("unpaid", "unpaid");

    expect(res.status).toBe(200);
    expect((await sub_get(SUB_ID))?.status).toBe("inactive");
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: { id: SUB_ID, platform: "stripe" },
    });
  });

  it("an unpaid delivery whose enqueue failed queues the cancel on redelivery", async () => {
    enqueue_mock.mockRejectedValueOnce(new Error("qstash unavailable"));
    const failed = await deliver("unpaid", "unpaid");
    expect(failed.status).toBe(400);

    const res = await deliver("unpaid", "unpaid");

    expect(res.status).toBe(200);
    expect(enqueue_mock).toHaveBeenCalledTimes(2);
    expect(enqueue_mock.mock.calls[1]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: { id: SUB_ID, platform: "stripe" },
    });
  });

  it("unpaid on a gift already inactive queues the cancel", async () => {
    await set_row({ status: "inactive" });

    const res = await deliver("unpaid", "unpaid");

    expect(res.status).toBe(200);
    expect((await sub_get(SUB_ID))?.status).toBe("inactive");
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: { id: SUB_ID, platform: "stripe" },
    });
  });

  it.each(["canceled", "incomplete_expired"])(
    "%s deactivates the gift without queueing a cancel",
    async (status) => {
      const res = await deliver(status, status);

      expect(res.status).toBe(200);
      expect((await sub_get(SUB_ID))?.status).toBe("inactive");
      expect(enqueue_mock).not.toHaveBeenCalled();
    }
  );

  it.each(["past_due", "unpaid"])(
    "a late %s delivery leaves a recovered gift active",
    async (stale) => {
      const res = await deliver(stale, "active");

      expect(res.status).toBe(200);
      const row = await sub_get(SUB_ID);
      expect(row?.status).toBe("active");
      expect(row?.next_billing).toBe(LIVE_END);
      expect(enqueue_mock).not.toHaveBeenCalled();
    }
  );

  it("a gift born incomplete turns active once its first payment lands", async () => {
    await set_row({
      status: "inactive",
      status_cancel_reason: FIRST_PAYMENT_INCOMPLETE,
    });

    const res = await deliver("active", "active");

    expect(res.status).toBe(200);
    const row = await sub_get(SUB_ID);
    expect(row?.status).toBe("active");
    expect(row?.status_cancel_reason).toBeNull();
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("a gift still incomplete stays inactive with no cancel queued", async () => {
    await set_row({
      status: "inactive",
      status_cancel_reason: FIRST_PAYMENT_INCOMPLETE,
    });

    const res = await deliver("incomplete", "incomplete");

    expect(res.status).toBe(200);
    expect((await sub_get(SUB_ID))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("a cancel that never reached stripe stays cancelled and is queued again", async () => {
    await set_row({
      status: "inactive",
      status_cancel_reason: "moving abroad",
    });

    const res = await deliver("active", "active");

    expect(res.status).toBe(200);
    const row = await sub_get(SUB_ID);
    expect(row?.status).toBe("inactive");
    expect(row?.next_billing).toBe(LIVE_END);
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: {
        id: SUB_ID,
        platform: "stripe",
        status_cancel_reason: "moving abroad",
      },
    });
  });

  it("past_due on a cancelled gift keeps it cancelled and queues the cancel again", async () => {
    await set_row({ status: "inactive" });

    const res = await deliver("past_due", "past_due");

    expect(res.status).toBe(200);
    expect((await sub_get(SUB_ID))?.status).toBe("inactive");
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      id: "sub-deactivated",
      payload: { id: SUB_ID, platform: "stripe" },
    });
  });

  it("customer.subscription.deleted deactivates the gift without queueing a cancel", async () => {
    construct_event_mock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: sub_obj("canceled") },
    });

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(200);
    expect((await sub_get(SUB_ID))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("customer.subscription.deleted before its row exists answers non-2xx so stripe redelivers", async () => {
    construct_event_mock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { ...sub_obj("canceled"), id: "sub_not_yet_written" } },
    });

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.ok).toBe(false);
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("a gift stripe ended records stripe's reason for ending it", async () => {
    construct_event_mock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          ...sub_obj("canceled"),
          cancellation_details: {
            reason: "payment_disputed",
            comment: null,
            feedback: null,
          },
        },
      },
    });

    await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe(
      "payment_disputed"
    );
  });

  it("unpaid records that stripe gave up on failed payments", async () => {
    await deliver("unpaid", "unpaid");

    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe(
      "payment_failed"
    );
    // the reason is on the row the cancel is queued with
    expect(enqueue_mock.mock.calls[0]![0]).toMatchObject({
      payload: { status_cancel_reason: "payment_failed" },
    });
  });

  it("stripe ending a gift the donor cancelled keeps the donor's reason", async () => {
    await set_row({
      status: "inactive",
      status_cancel_reason: "moving abroad",
    });
    construct_event_mock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          ...sub_obj("canceled"),
          cancellation_details: {
            reason: "cancellation_requested",
            comment: "moving abroad",
            feedback: null,
          },
        },
      },
    });

    await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect((await sub_get(SUB_ID))?.status_cancel_reason).toBe("moving abroad");
  });
});
