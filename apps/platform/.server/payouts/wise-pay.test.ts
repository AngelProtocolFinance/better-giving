import { beforeEach, describe, expect, test, vi } from "vitest";

const wise = vi.hoisted(() => ({
  v2_account: vi.fn(),
  quote: vi.fn(),
  transfer: vi.fn(),
  fund_transfer: vi.fn(),
}));

vi.mock("../env", () => ({ wise: { profile_id: "42" } }));
vi.mock("../kit/wise", () => ({ wise }));

const { wise_pay } = await import("./wise-pay");
const { NotFundedError } = await import("./transfer");

const TRANSFER_ID = 9001;
const REF = "0d3c1b52-7a4e-5c1f-9a2b-3c4d5e6f7a8b";
const quote_expired = [{ code: "error.quote.expired" }];

beforeEach(() => {
  wise.v2_account.mockReset().mockResolvedValue({ currency: "EUR" });
  wise.quote.mockReset().mockResolvedValue({ id: "quote-1" });
  wise.transfer
    .mockReset()
    .mockResolvedValue({ id: TRANSFER_ID, status: "incoming_payment_waiting" });
  wise.fund_transfer.mockReset().mockResolvedValue({ status: "COMPLETED" });
});

describe("wise_pay", () => {
  test("funds the transfer keyed on the ref and returns its id", async () => {
    await expect(wise_pay(777, 100, REF)).resolves.toBe(TRANSFER_ID);
    expect(wise.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ customerTransactionId: REF })
    );
    expect(wise.fund_transfer).toHaveBeenCalledWith(TRANSFER_ID, 42, {
      type: "BALANCE",
    });
  });

  test.each([
    ["the recipient lookup", "account 404", () => wise.v2_account],
    ["the quote", "quote 503", () => wise.quote],
    ["the transfer call", "transfer 500", () => wise.transfer],
  ])(
    "a throw from %s is not funded, and funding is never asked",
    async (_, cause, step) => {
      step().mockRejectedValue(cause);

      const err = await wise_pay(777, 100, REF).catch((e) => e);

      expect(err).toBeInstanceOf(NotFundedError);
      expect(err.cause).toBe(cause);
      expect(wise.fund_transfer).not.toHaveBeenCalled();
    }
  );

  test("a transfer answered with errors is not funded, and funding is never asked", async () => {
    wise.transfer.mockResolvedValue({ id: TRANSFER_ID, errors: quote_expired });

    const err = await wise_pay(777, 100, REF).catch((e) => e);

    expect(err).toBeInstanceOf(NotFundedError);
    expect(err.cause).toBe(quote_expired);
    expect(wise.fund_transfer).not.toHaveBeenCalled();
  });

  test("funding rejected by wise is not funded", async () => {
    wise.fund_transfer.mockResolvedValue({
      status: "REJECTED",
      errorCode: "balance.payment-option-unavailable",
    });

    const err = await wise_pay(777, 100, REF).catch((e) => e);

    expect(err).toBeInstanceOf(NotFundedError);
    expect(String(err.cause)).toContain("balance.payment-option-unavailable");
  });

  test.each([
    "incoming_payment_initiated",
    "processing",
    "funds_converted",
    "outgoing_payment_sent",
  ])(
    "a reused ref whose transfer an earlier run funded (%s) is paid, and not funded again",
    async (status) => {
      wise.transfer.mockResolvedValue({ id: TRANSFER_ID, status });

      await expect(wise_pay(777, 100, REF)).resolves.toBe(TRANSFER_ID);
      expect(wise.fund_transfer).not.toHaveBeenCalled();
    }
  );

  test.each(["cancelled", "funds_refunded", "bounced_back", undefined])(
    "a reused ref whose transfer is %s is neither funded nor called unfunded",
    async (status) => {
      wise.transfer.mockResolvedValue({ id: TRANSFER_ID, status });

      const err = await wise_pay(777, 100, REF).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(NotFundedError);
      expect(String(err)).toContain(REF);
      expect(wise.fund_transfer).not.toHaveBeenCalled();
    }
  );

  test("a throw from the funding call itself is left as funding status unknown", async () => {
    wise.fund_transfer.mockRejectedValue("fetch failed");

    const err = await wise_pay(777, 100, REF).catch((e) => e);

    expect(err).not.toBeInstanceOf(NotFundedError);
    expect(err).toBe("fetch failed");
  });
});
