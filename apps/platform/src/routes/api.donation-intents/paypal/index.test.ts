import { PayPalApiError } from "@better-giving/paypal";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../types";

const create_order_mock = vi.hoisted(() => vi.fn());
const create_subscription_mock = vi.hoisted(() => vi.fn());
const donation_put_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: {
    create_order: create_order_mock,
    create_subscription: create_subscription_mock,
  },
}));
vi.mock("#/.server/unit-per-usd", () => ({ unit_per_usd: async () => 1 }));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_put: donation_put_mock,
  donation_update: donation_update_mock,
}));

const { paypal_intent } = await import("./index");

const ctx = (patch: Partial<Ctx["intent"]> = {}) =>
  ({
    to: { to_id: "1", to_type: "npo", to_name: "ACME" },
    from: { from_email: "a@b.co" },
    donor: { email: "a@b.co" },
    via: "paypal",
    via_extra: "",
    intent: {
      amount: { base: 25, tip: 0, fee_allowance: 0 },
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      ...patch,
    },
  }) as unknown as Ctx;

beforeEach(() => {
  vi.clearAllMocks();
  donation_put_mock.mockImplementation(async (_db: unknown, r: unknown) => r);
  donation_update_mock.mockResolvedValue({});
  create_order_mock.mockResolvedValue({ id: "ORDER-1" });
});

describe("paypal_intent currency", () => {
  it("answers a currency paypal can't take with a 400, writing nothing", async () => {
    const res = (await paypal_intent(ctx({ currency: "NGN" }))) as Response;

    expect(res.status).toBe(400);
    expect(donation_put_mock).not.toHaveBeenCalled();
    expect(create_order_mock).not.toHaveBeenCalled();
  });
});

describe("paypal_intent charged total", () => {
  it.each([
    [
      "USD",
      { base: 25, tip: 0.004, fee_allowance: 1.039 },
      { base: 25, tip: 0, fee_allowance: 1.03 },
      "26.03",
    ],
    [
      "JPY",
      { base: 1500.5, tip: 75.9, fee_allowance: 45.2 },
      { base: 1500, tip: 75, fee_allowance: 45 },
      "1620",
    ],
  ])(
    "%s: the row and the answer carry what paypal is asked for",
    async (currency, amount, row, total) => {
      const res = await paypal_intent(ctx({ currency, amount }));

      expect(donation_put_mock.mock.calls[0]![1].amount).toEqual(row);
      expect(
        create_order_mock.mock.calls[0]![0].purchase_units[0].amount.value
      ).toBe(total);
      expect(res).toMatchObject({ body: { amount: total } });
    }
  );
});

describe("paypal_intent when paypal refuses the order", () => {
  it("marks the donation failed and rethrows", async () => {
    const refused = new PayPalApiError(
      "create order",
      422,
      '{"name":"UNPROCESSABLE_ENTITY"}'
    );
    create_order_mock.mockRejectedValue(refused);

    await expect(paypal_intent(ctx())).rejects.toBe(refused);

    const don_id = donation_put_mock.mock.calls[0]![1].id;
    expect(donation_update_mock).toHaveBeenCalledExactlyOnceWith(
      {},
      don_id,
      expect.objectContaining({ status: "failed" })
    );
  });

  it("leaves a donation paypal took the order for as created", async () => {
    const res = await paypal_intent(ctx());

    expect(res).toMatchObject({ body: { tx_id: "ORDER-1" } });
    expect(donation_put_mock.mock.calls[0]![1].status).toBe("created");
    expect(donation_update_mock).not.toHaveBeenCalled();
  });
});
