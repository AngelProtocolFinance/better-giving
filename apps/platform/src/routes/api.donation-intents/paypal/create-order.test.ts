import type { PurchaseUnitsRequest } from "@better-giving/paypal";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create_order_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { create_order: create_order_mock },
}));

const { create_order } = await import("./create-order");

const unit_for = async (
  currency: string,
  base: number,
  tip: number,
  fee_allowance: number
): Promise<PurchaseUnitsRequest> => {
  await create_order({
    order_id: "don-1",
    currency,
    npo_name: "Acme",
    base,
    tip,
    fee_allowance,
  });
  return create_order_mock.mock.calls[0]![0].purchase_units[0];
};

const values = (u: PurchaseUnitsRequest) => ({
  total: u.amount?.value,
  item_total: u.amount?.breakdown?.item_total?.value,
  items: u.items?.map((i) => i.unit_amount.value),
});

beforeEach(() => {
  vi.clearAllMocks();
  create_order_mock.mockResolvedValue({ id: "ORDER-1" });
});

describe("create_order purchase unit", () => {
  it("totals exactly the sum of its items", async () => {
    const u = await unit_for("USD", 5, 0.05, 0.14);
    expect(values(u)).toEqual({
      total: "5.19",
      item_total: "5.19",
      items: ["5.00", "0.05", "0.14"],
    });
  });

  it("names the nonprofit on a donation with no tip or fee coverage", async () => {
    const u = await unit_for("USD", 25, 0, 0);
    expect(u.items?.map((i) => i.name)).toEqual(["Donation to Acme"]);
    expect(values(u)).toEqual({
      total: "25.00",
      item_total: "25.00",
      items: ["25.00"],
    });
  });

  it("leaves out a zero fee-coverage line", async () => {
    const u = await unit_for("USD", 25, 2.5, 0);
    expect(u.items?.map((i) => i.name)).toEqual([
      "Donation to Acme",
      "Donation to Better Giving",
    ]);
    expect(values(u).item_total).toBe("27.50");
  });

  it("leaves out a zero tip line", async () => {
    const u = await unit_for("USD", 25, 0, 1.03);
    expect(u.items?.map((i) => i.name)).toEqual([
      "Donation to Acme",
      "Fee coverage",
    ]);
    expect(values(u).item_total).toBe("26.03");
  });

  it("leaves out a tip that truncates to zero minor units", async () => {
    const u = await unit_for("USD", 25, 0.004, 1.03);
    expect(u.items?.map((i) => i.name)).toEqual([
      "Donation to Acme",
      "Fee coverage",
    ]);
    expect(values(u).total).toBe("26.03");
  });

  it("sends whole numbers in a zero-decimal currency", async () => {
    const u = await unit_for("JPY", 1500.5, 75.9, 45.2);
    expect(values(u)).toEqual({
      total: "1620",
      item_total: "1620",
      items: ["1500", "75", "45"],
    });
  });

  it("formats a currency outside the paypal table at two decimals", async () => {
    const u = await unit_for("XYZ", 5, 0.05, 0.14);
    expect(values(u).total).toBe("5.19");
  });
});
