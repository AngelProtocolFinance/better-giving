import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const send_email_mock = vi.hoisted(() => vi.fn());
const template_mock = vi.hoisted(() =>
  vi.fn((_d: any) => ({ node: null, subject: "donation failed" }))
);
const donation_get_mock = vi.hoisted(() => vi.fn());
const invoice_payments_list_mock = vi.hoisted(() => vi.fn());

vi.mock("emails", () => ({ donation_error: { template: template_mock } }));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("$/pg/queries/donation", () => ({ donation_get: donation_get_mock }));
vi.mock("$/kit/stripe", () => ({
  stripe: { invoicePayments: { list: invoice_payments_list_mock } },
}));

const { handle_intent_failed } = await import("./intent-failed");
const { handle_setup_intent_failed } = await import("./setup-intent-failed");

const ORDER_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";

/** the donor identity lives on the order row, not on the intent */
const order = (patch: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  to_name: "Freegan Food Foundation",
  from_name: "Ada Lovelace",
  from_email: "ada@example.org",
  ...patch,
});

/**
 * a payment intent as the donation-intents route creates it today: the only
 * key in `metadata` is `order_id` (see api.donation-intents/stripe/payment-intent.ts).
 * the donor name/email/charity name it used to carry are gone.
 */
const failed = (
  metadata: Record<string, string>,
  err: { type: string; message: string } | null = {
    type: "invalid_request_error",
    message: "Your bank declined the transfer",
  }
) =>
  ({
    object: { id: "pi_1", metadata, last_payment_error: err },
  }) as any;

const subs_invoice = (metadata: Record<string, string>) => ({
  data: [
    {
      invoice: {
        deleted: false,
        parent: { subscription_details: { metadata } },
      },
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  template_mock.mockReturnValue({ node: null, subject: "donation failed" });
  send_email_mock.mockResolvedValue(undefined);
  donation_get_mock.mockResolvedValue(order());
});

describe("stripe payment_intent.payment_failed → donor email", () => {
  it("names the donor and recipient from the order the intent points at", async () => {
    await handle_intent_failed(failed({ order_id: ORDER_ID }));

    expect(donation_get_mock).toHaveBeenCalledWith(ORDER_ID);
    const d = template_mock.mock.calls[0]![0] as any;
    expect(d.donor_first_name).toBe("Ada");
    expect(d.recipient_name).toBe("Freegan Food Foundation");
    expect(d.error_message).toContain("Your bank declined the transfer");
    expect(send_email_mock).toHaveBeenCalledOnce();
    expect(send_email_mock.mock.calls[0]![0].to).toEqual(["ada@example.org"]);
  });

  it("greets a donor who left no name instead of throwing", async () => {
    donation_get_mock.mockResolvedValue(order({ from_name: undefined }));

    await handle_intent_failed(failed({ order_id: ORDER_ID }));

    const d = template_mock.mock.calls[0]![0] as any;
    expect(d.donor_first_name).toBe("Donor");
    expect(send_email_mock).toHaveBeenCalledOnce();
  });

  // a name column that is present but blank, and one that leads with
  // whitespace: both used to reach the template as "Hi ,"
  it.each([
    ["", "Donor"],
    ["   ", "Donor"],
    ["  Ada Lovelace", "Ada"],
  ])("greets %j as %j", async (from_name, expected) => {
    donation_get_mock.mockResolvedValue(order({ from_name }));

    await handle_intent_failed(failed({ order_id: ORDER_ID }));

    const d = template_mock.mock.calls[0]![0] as any;
    expect(d.donor_first_name).toBe(expected);
  });

  it("takes the order id off the invoice when a subscription rebill fails", async () => {
    invoice_payments_list_mock.mockResolvedValue(
      subs_invoice({ order_id: ORDER_ID })
    );

    // subs intents carry an empty metadata object — the id is on the invoice's
    // subscription_details
    await handle_intent_failed(failed({}));

    expect(donation_get_mock).toHaveBeenCalledWith(ORDER_ID);
    expect(send_email_mock).toHaveBeenCalledOnce();
  });

  it("stays out of the way of a card error the form already showed", async () => {
    await handle_intent_failed(
      failed(
        { order_id: ORDER_ID },
        { type: "card_error", message: "declined" }
      )
    );

    expect(donation_get_mock).not.toHaveBeenCalled();
    expect(send_email_mock).not.toHaveBeenCalled();
  });

  it("refuses to mail on an order id that names no donation", async () => {
    donation_get_mock.mockResolvedValue(undefined);

    await expect(
      handle_intent_failed(failed({ order_id: ORDER_ID }))
    ).rejects.toThrow(ORDER_ID);
    expect(send_email_mock).not.toHaveBeenCalled();
  });
});

describe("stripe setup_intent.setup_failed → donor email", () => {
  const setup_failed = () =>
    ({
      object: {
        id: "seti_1",
        metadata: { order_id: ORDER_ID },
        last_setup_error: { type: "api_error", message: "mandate refused" },
      },
    }) as any;

  // the same dead metadata key sent these to `undefined`. send_email swallows
  // its own failures, so nothing surfaced — the donor just never heard back.
  it("addresses the donor from the order row, not from stripe metadata", async () => {
    await handle_setup_intent_failed(setup_failed());

    expect(send_email_mock).toHaveBeenCalledOnce();
    expect(send_email_mock.mock.calls[0]![0].to).toEqual(["ada@example.org"]);
  });
});
