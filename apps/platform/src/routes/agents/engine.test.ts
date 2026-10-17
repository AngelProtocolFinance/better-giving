import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get_npos: vi.fn(),
  to_fn: vi.fn(),
  reserve: vi.fn(),
  donation_get: vi.fn(),
  checkout_save: vi.fn(),
  npo_get: vi.fn(),
  npo_by_regnum: vi.fn(),
  npo_program_get: vi.fn(),
  checkout_session: vi.fn(),
  checkout_session_state: vi.fn(),
  descriptor: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("$/env", () => ({
  app: {
    api_encryption_key: "test-quote-key",
    agent_donation_token: "agent-token-test",
  },
}));

vi.mock("#/.server/npos", () => ({ get_npos: mocks.get_npos }));
vi.mock("#/.server/donation-recipient", () => ({ to_fn: mocks.to_fn }));
vi.mock("$/pg/queries/donation", () => ({
  agent_checkout_save: mocks.checkout_save,
  agent_donation_expire: mocks.expire,
  agent_donation_reserve: mocks.reserve,
  donation_get: mocks.donation_get,
}));
vi.mock("$/pg/queries/npo", () => ({
  npo_by_regnum: mocks.npo_by_regnum,
  npo_get: mocks.npo_get,
}));
vi.mock("$/pg/queries/program", () => ({
  npo_program_get: mocks.npo_program_get,
}));
vi.mock("#/routes/api.donation-intents/stripe/checkout-session", () => ({
  checkout_session: mocks.checkout_session,
  checkout_session_state: mocks.checkout_session_state,
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
  mocks.reserve.mockResolvedValue("created");
  mocks.donation_get.mockResolvedValue(undefined);
  mocks.checkout_save.mockResolvedValue(true);
  mocks.npo_get.mockResolvedValue({ donor_address_required: false });
  mocks.descriptor.mockResolvedValue("ACME");
  mocks.expire.mockResolvedValue(true);
  mocks.checkout_session.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  });
});

function saved(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    source: "bg-agent",
    status: "created",
    from_email: donor.email,
    to_id: "7",
    to_name: "ACME",
    to_type: "npo",
    amount: { base: 10, tip: 0, fee_allowance: 0 },
    ...patch,
  };
}

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

  test("refuses a nonprofit that requires a donor address", async () => {
    mocks.npo_get.mockResolvedValue({ donor_address_required: true });

    await expect(quote()).rejects.toMatchObject({ code: "address_required" });
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
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: quoted.quote_id,
        source: "bg-agent",
        via: "stripe",
        currency: "USD",
        frequency: "one-time",
        from_email: donor.email,
        amount: { base: 10, tip: 1.5, fee_allowance: 0.57 },
      }),
      expect.any(String),
      5
    );
    expect(mocks.checkout_session).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: quoted.quote_id,
        donor_email: donor.email,
        recipient_name: "ACME",
      })
    );
    expect(mocks.checkout_save).toHaveBeenCalledWith(
      quoted.quote_id,
      "cs_test_1"
    );
  });

  test("same quote returns the existing session without another charge", async () => {
    const quoted = await quote();
    mocks.donation_get.mockResolvedValue(
      saved(quoted.quote_id, { via_extra: "cs_test_existing" })
    );
    mocks.checkout_session_state.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_existing",
    });

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
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  test("an edited quote token is refused before anything is written", async () => {
    const quoted = await quote();
    const [body, mac] = quoted.quote_token.split(".");
    const edited = JSON.parse(Buffer.from(body!, "base64url").toString());
    edited.amount = 1000;
    const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${mac}`;

    await expect(
      donate(
        { quote_token: forged, donor },
        new Request("https://better.giving/agents")
      )
    ).rejects.toMatchObject({ code: "invalid_quote" });
    expect(mocks.donation_get).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  test("a retry after a failed Stripe call charges the saved row, not the token", async () => {
    const quoted = await quote();
    mocks.donation_get.mockResolvedValue(
      saved(quoted.quote_id, {
        amount: { base: 25, tip: 0, fee_allowance: 0 },
      })
    );

    await donate(
      { quote_token: quoted.quote_token, donor },
      new Request("https://better.giving/agents")
    );

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.checkout_session).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: quoted.quote_id,
        base: 25,
        tip: 0,
        fee_allowance: 0,
        cancel_path: "/donate/7",
      })
    );
  });

  test("a different donor cannot take over a reserved quote", async () => {
    const quoted = await quote();
    mocks.donation_get.mockResolvedValue(saved(quoted.quote_id));

    await expect(
      donate(
        {
          quote_token: quoted.quote_token,
          donor: { ...donor, email: "other@example.com" },
        },
        new Request("https://better.giving/agents")
      )
    ).rejects.toMatchObject({ code: "quote_conflict" });
    expect(mocks.checkout_session).not.toHaveBeenCalled();
  });

  test("an expired Checkout can be donated again", async () => {
    const quoted = await quote();
    mocks.donation_get.mockResolvedValue(
      saved(quoted.quote_id, { via_extra: "cs_test_old" })
    );
    mocks.checkout_session_state.mockResolvedValue({ status: "expired" });
    mocks.checkout_session.mockResolvedValue({
      id: "cs_test_new",
      url: "https://checkout.stripe.com/c/pay/cs_test_new",
    });

    const result = await donate(
      { quote_token: quoted.quote_token, donor },
      new Request("https://better.giving/agents")
    );

    expect(result).toStrictEqual({
      donation_id: quoted.quote_id,
      checkout_url: "https://checkout.stripe.com/c/pay/cs_test_new",
    });
    expect(mocks.expire).toHaveBeenCalledWith(quoted.quote_id, "cs_test_old");
    expect(mocks.checkout_session).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: quoted.quote_id,
        idempotency_key: `agent-checkout:${quoted.quote_id}:after:cs_test_old`,
      })
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  test("a save that loses to a paid gift does not report a new checkout", async () => {
    const quoted = await quote();
    mocks.checkout_save.mockResolvedValue(false);

    await expect(
      donate(
        { quote_token: quoted.quote_token, donor },
        new Request("https://better.giving/agents")
      )
    ).rejects.toMatchObject({ code: "quote_used" });
  });

  test("an expired quote is rejected before anything is written", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
      const quoted = await quote();
      vi.setSystemTime(new Date("2026-10-16T14:00:00Z"));

      await expect(
        donate(
          { quote_token: quoted.quote_token, donor },
          new Request("https://better.giving/agents")
        )
      ).rejects.toMatchObject({ code: "quote_expired" });
      expect(mocks.donation_get).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.checkout_session).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("rate limit keys on the agent token, then the trusted address", async () => {
    const authed = await quote();
    await donate(
      { quote_token: authed.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: {
          authorization: "Bearer agent-token-test",
          "x-forwarded-for": "203.0.113.8, 10.0.0.1",
          "cf-connecting-ip": "198.51.100.9",
        },
      })
    );
    const spoofed = await quote();
    await donate(
      { quote_token: spoofed.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: {
          authorization: "Bearer not-the-token",
          "x-forwarded-for": "198.51.100.20, 10.0.0.2",
          "cf-connecting-ip": "198.51.100.21",
        },
      })
    );
    const spoofed_again = await quote();
    await donate(
      { quote_token: spoofed_again.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: {
          authorization: "Bearer a-different-token",
          "x-forwarded-for": "203.0.113.50, 10.0.0.3",
          "cf-connecting-ip": "198.51.100.99",
        },
      })
    );
    const trusted = await quote();
    await donate(
      { quote_token: trusted.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: { "x-forwarded-for": "203.0.113.8" },
      })
    );

    const ids = mocks.reserve.mock.calls.map((call) => call[0].source_id);
    expect(ids[1]).toBe(ids[2]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[3]).not.toBe(ids[0]);
    expect(ids[3]).not.toBe(ids[1]);
  });

  test("rate limit keys on one trusted address, not a caller-supplied header", async () => {
    const spoofed = {
      "cf-connecting-ip": "198.51.100.9",
      "x-forwarded-for": "203.0.113.8, 10.0.0.1",
    };
    const first = await quote();
    await donate(
      { quote_token: first.quote_token, donor },
      new Request("https://better.giving/agents", { headers: spoofed })
    );
    const second = await quote();
    await donate(
      { quote_token: second.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: { ...spoofed, "cf-connecting-ip": "198.51.100.10" },
      })
    );
    const trusted = await quote();
    await donate(
      { quote_token: trusted.quote_token, donor },
      new Request("https://better.giving/agents", {
        headers: { "x-forwarded-for": "203.0.113.8" },
      })
    );

    const ids = mocks.reserve.mock.calls.map((call) => call[0].source_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  test("customer or IP cap refuses before writing or calling Stripe", async () => {
    const quoted = await quote();
    mocks.reserve.mockResolvedValue("limited");

    await expect(
      donate(
        { quote_token: quoted.quote_token, donor },
        new Request("https://better.giving/agents")
      )
    ).rejects.toMatchObject({ code: "rate_limited" });
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

  test("reports an abandoned Checkout as expired", async () => {
    const id = "6e2ee494-1cda-4b0b-9867-37a25b9c76c4";
    mocks.donation_get.mockResolvedValue({
      ...saved(id, { via_extra: "cs_test_old" }),
      currency: "USD",
    });
    mocks.checkout_session_state.mockResolvedValue({ status: "expired" });

    const result = await donation_status({ donation_id: id });

    expect(result.status).toBe("expired");
    expect(mocks.expire).toHaveBeenCalledWith(id, "cs_test_old");
  });

  test("an open Checkout stays created", async () => {
    const id = "6e2ee494-1cda-4b0b-9867-37a25b9c76c4";
    mocks.donation_get.mockResolvedValue({
      ...saved(id, { via_extra: "cs_test_open" }),
      currency: "USD",
    });
    mocks.checkout_session_state.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_open",
    });

    const result = await donation_status({ donation_id: id });

    expect(result.status).toBe("created");
    expect(mocks.expire).not.toHaveBeenCalled();
  });
});
