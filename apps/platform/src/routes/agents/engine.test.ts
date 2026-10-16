import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get_npos: vi.fn(),
  to_fn: vi.fn(),
  count: vi.fn(),
  donation_get: vi.fn(),
  donation_put: vi.fn(),
  donation_update: vi.fn(),
  npo_by_regnum: vi.fn(),
  npo_program_get: vi.fn(),
  checkout_session: vi.fn(),
  checkout_session_url: vi.fn(),
  customer: vi.fn(),
  descriptor: vi.fn(),
}));

vi.mock("#/.server/npos", () => ({ get_npos: mocks.get_npos }));
vi.mock("#/.server/donation-recipient", () => ({ to_fn: mocks.to_fn }));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  agent_donation_count_since: mocks.count,
  donation_get: mocks.donation_get,
  donation_put: mocks.donation_put,
  donation_update: mocks.donation_update,
}));
vi.mock("$/pg/queries/npo", () => ({
  npo_by_regnum: mocks.npo_by_regnum,
}));
vi.mock("$/pg/queries/program", () => ({
  npo_program_get: mocks.npo_program_get,
}));
vi.mock("#/routes/api.donation-intents/stripe/checkout-session", () => ({
  checkout_session: mocks.checkout_session,
  checkout_session_url: mocks.checkout_session_url,
}));
vi.mock("#/routes/api.donation-intents/stripe/customer-with-currency", () => ({
  customer_with_currency: mocks.customer,
}));
vi.mock("#/routes/api.donation-intents/stripe/descriptor-suffix", () => ({
  npo_descriptor_suffix: mocks.descriptor,
}));

const { AgentDonationError, create_quote, donate, donation_status } =
  await import("./engine");

const recipient = {
  to_id: "7",
  to_name: "ACME",
  to_type: "npo" as const,
  to_tip_allowed: true,
  to_members: [],
};
const donor = {
  email: "donor@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.to_fn.mockResolvedValue(recipient);
  mocks.count.mockResolvedValue(0);
  mocks.donation_get.mockResolvedValue(undefined);
  mocks.donation_put.mockImplementation(async (_db, row) => row);
  mocks.donation_update.mockResolvedValue(undefined);
  mocks.customer.mockResolvedValue("cus_test");
  mocks.descriptor.mockResolvedValue("ACME");
  mocks.checkout_session.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  });
});

async function quote(
  patch: Partial<{
    amount: number;
    tip_percent: "none" | "10" | "15" | "20";
    cover_processing_fee: boolean;
  }> = {}
) {
  return create_quote({
    recipient_id: 7,
    amount: 10,
    tip_percent: "none",
    cover_processing_fee: false,
    ...patch,
  });
}

describe("agent quote", () => {
  test("returns the same USD amount split the card form uses", async () => {
    const result = await quote({
      tip_percent: "10",
      cover_processing_fee: true,
    });

    expect(result).toMatchObject({
      recipient: { id: "7", name: "ACME", type: "npo" },
      currency: "USD",
      frequency: "one-time",
      amount: { base: 10, tip: 1, fee_allowance: 0.56, total: 11.56 },
    });
  });

  test("refuses a tip when the recipient hides Better Giving tips", async () => {
    mocks.to_fn.mockResolvedValue({ ...recipient, to_tip_allowed: false });

    await expect(quote({ tip_percent: "10" })).rejects.toMatchObject({
      code: "tip_not_allowed",
    });
  });

  test.each([1.99, 2.001])(
    "refuses an unsupported amount before creating a quote: %s",
    async (amount) => {
      await expect(quote({ amount })).rejects.toBeInstanceOf(
        AgentDonationError
      );
      expect(mocks.to_fn).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["currency", "EUR"],
    ["frequency", "monthly"],
  ])("refuses unsupported %s", async (field, value) => {
    await expect(
      create_quote({
        recipient_id: 7,
        amount: 10,
        [field]: value,
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(mocks.to_fn).not.toHaveBeenCalled();
  });
});

describe("agent donate", () => {
  test("writes a form-shaped bg-agent donation and returns hosted Checkout", async () => {
    const quoted = await quote({
      tip_percent: "15",
      cover_processing_fee: true,
    });

    const result = await donate(
      { quote_token: quoted.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: { "x-forwarded-for": "203.0.113.8" },
      })
    );

    expect(result).toStrictEqual({
      donation_id: quoted.quote_id,
      checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(mocks.donation_put).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        id: quoted.quote_id,
        source: "bg-agent",
        via: "stripe",
        currency: "USD",
        frequency: "one-time",
        from_email: donor.email,
        amount: { base: 10, tip: 1.5, fee_allowance: 0.57 },
      })
    );
    expect(mocks.checkout_session).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: quoted.quote_id,
        donor_email: donor.email,
        recipient_name: "ACME",
      })
    );
    expect(mocks.donation_update).toHaveBeenCalledWith({}, quoted.quote_id, {
      via_extra: "cs_test_1",
    });
  });

  test("same quote returns the existing session without another charge", async () => {
    const quoted = await quote();
    mocks.donation_get.mockResolvedValue({
      id: quoted.quote_id,
      source: "bg-agent",
      via_extra: "cs_test_existing",
    });
    mocks.checkout_session_url.mockResolvedValue(
      "https://checkout.stripe.com/c/pay/cs_test_existing"
    );

    const first = await donate(
      { quote_token: quoted.quote_token, donor },
      new Request("https://better.giving/agents")
    );
    const second = await donate(
      { quote_token: quoted.quote_token, donor },
      new Request("https://better.giving/agents")
    );

    expect(first).toStrictEqual(second);
    expect(mocks.checkout_session).not.toHaveBeenCalled();
    expect(mocks.donation_put).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  test("customer or IP cap refuses before writing or calling Stripe", async () => {
    const quoted = await quote();
    mocks.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);

    await expect(
      donate(
        { quote_token: quoted.quote_token, donor },
        new Request("https://better.giving/agents")
      )
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(mocks.donation_put).not.toHaveBeenCalled();
    expect(mocks.checkout_session).not.toHaveBeenCalled();
  });
});

describe("agent status", () => {
  test("returns status and amounts without donor data", async () => {
    mocks.donation_get.mockResolvedValue({
      id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
      source: "bg-agent",
      status: "settled",
      currency: "USD",
      amount: { base: 10, tip: 1, fee_allowance: 0.5 },
    });

    const result = await donation_status({
      donation_id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
    });

    expect(result).toStrictEqual({
      donation_id: "6e2ee494-1cda-4b0b-9867-37a25b9c76c4",
      status: "settled",
      currency: "USD",
      amount: { base: 10, tip: 1, fee_allowance: 0.5, total: 11.5 },
    });
    expect(result).not.toHaveProperty("from_email");
  });
});
