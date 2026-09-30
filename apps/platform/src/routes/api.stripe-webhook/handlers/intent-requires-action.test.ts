import { beforeEach, describe, expect, it, vi } from "vitest";

const send_email_mock = vi.hoisted(() => vi.fn());
const template_mock = vi.hoisted(() =>
  vi.fn((_d: any) => ({ node: null, subject: "verify" }))
);
const pm_retrieve_mock = vi.hoisted(() => vi.fn());
const status_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());

vi.mock("emails", () => ({
  donation_microdeposit_action: { template: template_mock },
}));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("$/kit/stripe", () => ({
  stripe: { paymentMethods: { retrieve: pm_retrieve_mock } },
}));
vi.mock("$/pg/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_settle_state_locked: async () => ({ status: await status_mock() }),
  donation_update: donation_update_mock,
}));

const { handle_intent_requires_action } = await import(
  "./intent-requires-action"
);

const ORDER_ID = "order-1";

const intent = () =>
  ({
    id: "pi_1",
    metadata: { order_id: ORDER_ID },
    payment_method: "pm_1",
    next_action: {
      type: "verify_with_microdeposits",
      verify_with_microdeposits: { hosted_verification_url: "https://verify" },
    },
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  pm_retrieve_mock.mockResolvedValue({ type: "us_bank_account" });
  donation_update_mock.mockResolvedValue({
    to_name: "ACME",
    from_name: "Ada Lovelace",
    from_email: "ada@example.org",
  });
  send_email_mock.mockResolvedValue(undefined);
});

describe("stripe requires_action (microdeposits) → verification email", () => {
  it("leaves a donation that has since settled alone and sends no verification link", async () => {
    status_mock.mockResolvedValue("settled");

    await handle_intent_requires_action(intent());

    expect(donation_update_mock).not.toHaveBeenCalled();
    expect(send_email_mock).not.toHaveBeenCalled();
  });

  it.each(["created", "intent"])(
    "marks a %s donation as intent and emails the verification link",
    async (status) => {
      status_mock.mockResolvedValue(status);

      await handle_intent_requires_action(intent());

      expect(donation_update_mock.mock.calls[0]![2]).toMatchObject({
        status: "intent",
        via_extra: "https://verify",
      });
      expect(send_email_mock).toHaveBeenCalledOnce();
      expect(send_email_mock.mock.calls[0]![0].to).toEqual(["ada@example.org"]);
    }
  );
});
