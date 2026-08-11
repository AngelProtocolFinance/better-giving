import { beforeEach, describe, expect, it, vi } from "vitest";

const capture_order_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { capture_order: capture_order_mock },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_update: donation_update_mock,
}));

const { capture_order } = await import("./capture-order");

const update_arg = () => donation_update_mock.mock.calls[0]![2];

beforeEach(() => {
  vi.clearAllMocks();
  donation_update_mock.mockResolvedValue({});
});

describe("capture_order donor patch", () => {
  it("leaves from_name untouched when paypal omits the name object", async () => {
    capture_order_mock.mockResolvedValue({
      payment_source: { paypal: { email_address: "guest@b.co" } },
    });

    await capture_order({ order_id: "o1", don_id: "d1" });

    expect(donation_update_mock).toHaveBeenCalledOnce();
    expect(update_arg()).not.toHaveProperty("from_name");
    expect(update_arg().from_email).toBe("guest@b.co");
  });

  it("writes the full name and address when paypal returns them", async () => {
    capture_order_mock.mockResolvedValue({
      payment_source: {
        paypal: {
          email_address: "jane@b.co",
          name: { given_name: "Jane", surname: "Roe" },
          address: {
            address_line_1: "1 Main St",
            address_line_2: "Apt 2",
            admin_area_2: "Denver",
            admin_area_1: "CO",
            postal_code: "80202",
            country_code: "US",
          },
        },
      },
    });

    await capture_order({ order_id: "o2", don_id: "d2" });

    expect(update_arg()).toEqual({
      from_email: "jane@b.co",
      from_name: "Jane Roe",
      from_addr_street: "1 Main St Apt 2",
      from_addr_city: "Denver",
      from_addr_state: "CO",
      from_addr_zip_code: "80202",
      from_addr_country: "US",
    });
  });

  it.each([
    ["given_name only", { given_name: "Jane" }, "Jane"],
    ["surname only", { surname: "Roe" }, "Roe"],
  ])("keeps a partial name as-is: %s", async (_label, name, expected) => {
    capture_order_mock.mockResolvedValue({
      payment_source: { paypal: { email_address: "jane@b.co", name } },
    });

    await capture_order({ order_id: "o3", don_id: "d3" });

    expect(update_arg().from_name).toBe(expected);
  });

  it("applies the same name guard to a venmo payment source", async () => {
    capture_order_mock.mockResolvedValue({
      payment_source: { venmo: { email_address: "v@b.co" } },
    });

    await capture_order({ order_id: "o4", don_id: "d4" });

    expect(donation_update_mock).toHaveBeenCalledOnce();
    expect(update_arg()).not.toHaveProperty("from_name");
  });

  it("skips the update entirely when no email is returned", async () => {
    capture_order_mock.mockResolvedValue({
      payment_source: { paypal: { name: { given_name: "Jane" } } },
    });

    await capture_order({ order_id: "o5", don_id: "d5" });

    expect(donation_update_mock).not.toHaveBeenCalled();
  });
});
