import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_PAYMENT_INCOMPLETE } from "@/subscriptions";

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

// subscriptions.create (setup-intent-succeeded.ts) sets no trial, so neither `trialing`
// nor `paused` (only a trial ending without a payment method pauses) reaches this handler
describe("customer.subscription.created → subscription row", () => {
  it.each([
    { live: "active", status: "active", reason: undefined },
    { live: "past_due", status: "active", reason: undefined },
    { live: "unpaid", status: "inactive", reason: undefined },
    { live: "canceled", status: "inactive", reason: undefined },
    { live: "incomplete_expired", status: "inactive", reason: undefined },
    {
      live: "incomplete",
      status: "inactive",
      reason: FIRST_PAYMENT_INCOMPLETE,
    },
  ])(
    "writes a sub stripe reads back as $live as $status, whatever the event's copy says",
    async ({ live, status, reason }) => {
      sub_retrieve_mock.mockResolvedValue(stripe_sub(live));

      await handle_subscription_created({
        object: stripe_sub(status === "active" ? "canceled" : "active"),
      } as any);

      expect(written().status).toBe(status);
      expect(written().status_cancel_reason).toBe(reason);
    }
  );

  it("throws and writes nothing when the order is gone", async () => {
    sub_retrieve_mock.mockResolvedValue(stripe_sub("active"));
    donation_get_mock.mockResolvedValue(undefined);

    await expect(
      handle_subscription_created({ object: stripe_sub("active") } as any)
    ).rejects.toThrow(/Order not found for id:order-1/);
    expect(sub_put_mock).not.toHaveBeenCalled();
  });
});
