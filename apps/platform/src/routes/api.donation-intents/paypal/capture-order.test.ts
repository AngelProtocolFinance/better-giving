import { PayPalSDK } from "@better-giving/paypal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paypal_capture_outcome } from "@/donations/paypal-capture";

const capture_order_mock = vi.hoisted(() => vi.fn());
const get_order_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const report_degraded_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { capture_order: capture_order_mock, get_order: get_order_mock },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_update: donation_update_mock,
}));
vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_degraded: report_degraded_mock,
}));

const { capture_order } = await import("./capture-order");

const update_arg = () => donation_update_mock.mock.calls[0]![2];

/** a capture paypal took for donation `don_id`, carrying the given payment source */
const taken = (
  payment_source: unknown,
  status = "COMPLETED",
  don_id = "d1"
) => ({
  payment_source,
  purchase_units: [{ custom_id: don_id, payments: { captures: [{ status }] } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  donation_update_mock.mockResolvedValue({});
});

describe("capture_order donor patch", () => {
  it("leaves from_name untouched when paypal omits the name object", async () => {
    capture_order_mock.mockResolvedValue(
      taken({ paypal: { email_address: "guest@b.co" } })
    );

    await capture_order({ order_id: "o1", don_id: "d1" });

    expect(donation_update_mock).toHaveBeenCalledOnce();
    expect(update_arg()).not.toHaveProperty("from_name");
    expect(update_arg().from_email).toBe("guest@b.co");
  });

  it("writes the full name and address when paypal returns them", async () => {
    capture_order_mock.mockResolvedValue(
      taken({
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
      })
    );

    await capture_order({ order_id: "o2", don_id: "d1" });

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
    capture_order_mock.mockResolvedValue(
      taken({ paypal: { email_address: "jane@b.co", name } })
    );

    await capture_order({ order_id: "o3", don_id: "d1" });

    expect(update_arg().from_name).toBe(expected);
  });

  it("applies the same name guard to a venmo payment source", async () => {
    capture_order_mock.mockResolvedValue(
      taken({ venmo: { email_address: "v@b.co" } })
    );

    await capture_order({ order_id: "o4", don_id: "d1" });

    expect(donation_update_mock).toHaveBeenCalledOnce();
    expect(update_arg()).not.toHaveProperty("from_name");
  });

  // the email is not what carries the rest of the record — venmo and a paypal
  // account with a withheld email both report a payer name without one
  it("writes a name paypal returns with no email beside it", async () => {
    capture_order_mock.mockResolvedValue(
      taken({ paypal: { name: { given_name: "Jane" } } })
    );

    await capture_order({ order_id: "o5", don_id: "d1" });

    expect(update_arg()).toEqual({ from_name: "Jane" });
  });

  // the donor typed an address at intent time; a country on its own would
  // otherwise be merged onto their street, city and zip
  it("leaves the address alone when paypal has neither street nor city", async () => {
    capture_order_mock.mockResolvedValue(
      taken({
        paypal: { email_address: "jane@b.co", address: { country_code: "GB" } },
      })
    );

    await capture_order({ order_id: "o6", don_id: "d1" });

    expect(update_arg()).toEqual({ from_email: "jane@b.co" });
  });

  it("writes for a capture paypal holds as PENDING", async () => {
    capture_order_mock.mockResolvedValue(
      taken({ paypal: { email_address: "jane@b.co" } }, "PENDING")
    );

    await capture_order({ order_id: "o10", don_id: "d1" });

    expect(update_arg()).toEqual({ from_email: "jane@b.co" });
  });

  it("skips the update entirely when there is nothing to write", async () => {
    capture_order_mock.mockResolvedValue(taken({ paypal: {} }));

    await capture_order({ order_id: "o7", don_id: "d1" });

    expect(donation_update_mock).not.toHaveBeenCalled();
  });
});

describe("capture_order for a donation the order isn't for", () => {
  // don ids appear in thank-you urls; the order's custom_id is the binding
  it("writes no donor details onto the named donation, and refuses", async () => {
    capture_order_mock.mockResolvedValue(
      taken(
        {
          paypal: { email_address: "jane@b.co", name: { given_name: "Jane" } },
        },
        "COMPLETED",
        "d-own"
      )
    );

    const res = await capture_order({
      order_id: "o15",
      don_id: "d-victim",
    }).catch((r: unknown) => r);

    expect(donation_update_mock).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
  });

  it("refuses an order that names no donation", async () => {
    capture_order_mock.mockResolvedValue({
      payment_source: { paypal: { email_address: "jane@b.co" } },
      purchase_units: [{ payments: { captures: [{ status: "COMPLETED" }] } }],
    });

    const res = await capture_order({ order_id: "o16", don_id: "d1" }).catch(
      (r: unknown) => r
    );

    expect(donation_update_mock).not.toHaveBeenCalled();
    expect((res as Response).status).toBe(400);
  });
});

describe("capture_order when paypal declines the capture", () => {
  it.each(["DECLINED", "FAILED"])(
    "%s writes no donor details and is reported",
    async (status) => {
      const capture = {
        id: "o9",
        status: "APPROVED",
        payment_source: {
          paypal: {
            email_address: "jane@b.co",
            name: { given_name: "Jane", surname: "Roe" },
          },
        },
        purchase_units: [
          {
            custom_id: "d9",
            payments: { captures: [{ id: "c9", status }] },
          },
        ],
      };
      capture_order_mock.mockResolvedValue(capture);

      const res = await capture_order({ order_id: "o9", don_id: "d9" });

      expect(res).toEqual(capture);
      expect(donation_update_mock).not.toHaveBeenCalled();
      expect(report_degraded_mock).toHaveBeenCalledOnce();
      expect(report_degraded_mock.mock.calls[0]![1]).toEqual({
        order_id: "o9",
        don_id: "d9",
        status,
      });
      expect(report_error_mock).not.toHaveBeenCalled();
    }
  );
});

describe("capture_order when paypal reports no capture status", () => {
  // it may still complete, and the capture webhook re-writes donor details
  // only when paypal returns an email
  it("still writes donor details, and is reported", async () => {
    const capture = {
      id: "o11",
      payment_source: { paypal: { email_address: "jane@b.co" } },
      purchase_units: [{ custom_id: "d11", payments: { captures: [{}] } }],
    };
    capture_order_mock.mockResolvedValue(capture);

    const res = await capture_order({ order_id: "o11", don_id: "d11" });

    expect(res).toEqual(capture);
    expect(update_arg()).toEqual({ from_email: "jane@b.co" });
    expect(report_degraded_mock).toHaveBeenCalledOnce();
    expect(report_degraded_mock.mock.calls[0]![1]).toEqual({
      order_id: "o11",
      don_id: "d11",
      status: undefined,
    });
  });
});

describe("capture_order after paypal has captured", () => {
  it("returns the capture and reports a donor-patch write that fails", async () => {
    const capture = {
      id: "o8",
      status: "COMPLETED",
      payment_source: { paypal: { email_address: "jane@b.co" } },
      purchase_units: [
        {
          custom_id: "d8",
          payments: { captures: [{ id: "c8", status: "COMPLETED" }] },
        },
      ],
    };
    capture_order_mock.mockResolvedValue(capture);
    const db_down = new Error("neon: connection terminated");
    donation_update_mock.mockRejectedValue(db_down);

    const res = await capture_order({ order_id: "o8", don_id: "d8" });

    expect(res).toEqual(capture);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock.mock.calls[0]![0]).toBe(db_down);
  });
});

describe("capture_order when paypal refuses the payer's instrument", () => {
  // the real sdk over a stubbed network, so what it throws is what this reads
  const sdk = new PayPalSDK({
    client_id: "id",
    client_secret: "secret",
    api_url: "https://api-m.sandbox.paypal.com",
  });
  const paypal_answers = (capture: Response) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/v1/oauth2/token")
          ? Response.json({ access_token: "tok", expires_in: 32400 })
          : capture
      )
    );
  const unprocessable = (issue: string) =>
    Response.json(
      {
        name: "UNPROCESSABLE_ENTITY",
        message:
          "The requested action could not be performed, semantically incorrect, or failed business validation.",
        debug_id: "dbg_1",
        details: [{ issue, description: "declined" }],
      },
      { status: 422 }
    );

  beforeEach(() => {
    capture_order_mock.mockImplementation((id: string, request_id?: string) =>
      sdk.capture_order(id, request_id)
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["INSTRUMENT_DECLINED", "PAYER_ACTION_REQUIRED"])(
    "%s answers as a declined capture, and is reported",
    async (issue) => {
      paypal_answers(unprocessable(issue));

      const res = await capture_order({ order_id: "o12", don_id: "d12" });

      expect(paypal_capture_outcome(res).outcome).toBe("declined");
      expect(donation_update_mock).not.toHaveBeenCalled();
      expect(report_degraded_mock).toHaveBeenCalledOnce();
      expect(report_degraded_mock.mock.calls[0]![1]).toEqual({
        order_id: "o12",
        don_id: "d12",
        issue,
      });
      expect(report_error_mock).not.toHaveBeenCalled();
    }
  );

  // the webhook's delayed fallback captured it while the donor's browser was away
  it("answers an order already captured with that capture, as taken", async () => {
    paypal_answers(unprocessable("ORDER_ALREADY_CAPTURED"));
    get_order_mock.mockResolvedValue({
      id: "o14",
      status: "COMPLETED",
      purchase_units: [
        {
          custom_id: "d14",
          payments: { captures: [{ id: "c14", status: "COMPLETED" }] },
        },
      ],
    });

    const res = await capture_order({ order_id: "o14", don_id: "d14" });

    expect(get_order_mock).toHaveBeenCalledWith("o14");
    expect(paypal_capture_outcome(res).outcome).toBe("taken");
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  // the money may have moved, so the browser must hear a failure, never a decline
  it.each([
    ["a 422 that isn't a refusal", unprocessable("ORDER_NOT_APPROVED")],
    [
      "a 500",
      Response.json(
        {
          name: "INTERNAL_SERVER_ERROR",
          details: [{ issue: "INSTRUMENT_DECLINED" }],
        },
        { status: 500 }
      ),
    ],
    ["a 422 with no json body", new Response("<html>", { status: 422 })],
  ])("%s is still thrown", async (_label, answer) => {
    paypal_answers(answer);

    await expect(
      capture_order({ order_id: "o13", don_id: "d13" })
    ).rejects.toThrow("Failed to capture order");
    expect(report_degraded_mock).not.toHaveBeenCalled();
  });
});
