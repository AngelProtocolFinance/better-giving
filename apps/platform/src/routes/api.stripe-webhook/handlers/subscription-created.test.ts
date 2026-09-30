import { beforeEach, describe, expect, it, vi } from "vitest";

const sub_retrieve_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const sub_put_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: { subscriptions: { retrieve: sub_retrieve_mock } },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({ donation_get: donation_get_mock }));
vi.mock("$/pg/queries/subscription", () => ({ sub_put: sub_put_mock }));

const { handle_subscription_created } = await import("./subscription-created");

const SUB_ID = "sub_1";

const stripe_sub = (status: string) => ({
  id: SUB_ID,
  status,
  created: 1767225600,
  metadata: { order_id: "order-1" },
  items: {
    data: [
      {
        current_period_end: 1769904000,
        price: {
          id: "price_1",
          product: "prod_1",
          recurring: { interval: "month", interval_count: 1 },
        },
      },
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  donation_get_mock.mockResolvedValue({
    id: "order-1",
    amount: { base: 50, tip: 0, fee_allowance: 0 },
    upusd: 1,
    currency: "USD",
    to_type: "npo",
    to_id: "1",
    to_name: "ACME",
    from_email: "a@b.co",
  });
});

const written = () => sub_put_mock.mock.calls[0]![1];

describe("customer.subscription.created → subscription row", () => {
  it("writes a sub stripe has already ended as inactive, whatever the event's copy says", async () => {
    sub_retrieve_mock.mockResolvedValue(stripe_sub("canceled"));

    await handle_subscription_created({ object: stripe_sub("active") } as any);

    expect(written().status).toBe("inactive");
  });

  it("writes a sub whose first charge hasn't landed (incomplete) as inactive", async () => {
    sub_retrieve_mock.mockResolvedValue(stripe_sub("incomplete"));

    await handle_subscription_created({
      object: stripe_sub("incomplete"),
    } as any);

    expect(written().status).toBe("inactive");
  });

  it("writes a sub whose first charge landed as active", async () => {
    sub_retrieve_mock.mockResolvedValue(stripe_sub("active"));

    await handle_subscription_created({ object: stripe_sub("active") } as any);

    expect(written().status).toBe("active");
  });
});
