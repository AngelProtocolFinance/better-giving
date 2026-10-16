import { beforeEach, describe, expect, test, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const retrieve = vi.hoisted(() => vi.fn());

vi.mock("$/env", () => ({ base_url: "https://staging.example" }));
vi.mock("$/kit/stripe", () => ({
  stripe: { checkout: { sessions: { create, retrieve } } },
}));

const { checkout_session, checkout_session_url } = await import(
  "./checkout-session"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent Checkout Session", () => {
  test("creates one hosted payment with settlement metadata and stable idempotency", async () => {
    create.mockResolvedValue({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });

    const result = await checkout_session({
      base: 10,
      tip: 1,
      fee_allowance: 0.55,
      order_id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
      donor_email: "donor@example.com",
      recipient_name: "ACME",
      descriptor_suffix: "ACME",
    });

    expect(result).toStrictEqual({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "donor@example.com",
        customer_creation: "always",
        metadata: {
          order_id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
        },
        payment_intent_data: expect.objectContaining({
          capture_method: "automatic",
          metadata: {
            order_id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
          },
          receipt_email: "donor@example.com",
        }),
        success_url:
          "https://staging.example/agents?donation_id=6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
      }),
      {
        idempotencyKey: "agent-checkout:6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
      }
    );
    expect(create.mock.calls[0]![0].line_items[0].price_data.unit_amount).toBe(
      1155
    );
  });

  test("recovers the hosted URL for an idempotent repeat", async () => {
    retrieve.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test_existing",
    });

    await expect(checkout_session_url("cs_test_existing")).resolves.toBe(
      "https://checkout.stripe.com/c/pay/cs_test_existing"
    );
  });
});
