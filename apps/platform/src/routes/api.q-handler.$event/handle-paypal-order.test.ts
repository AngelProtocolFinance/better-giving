import { PayPalApiError } from "@better-giving/paypal";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get_order_mock = vi.hoisted(() => vi.fn());
const capture_order_mock = vi.hoisted(() => vi.fn());
const report_degraded_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { get_order: get_order_mock, capture_order: capture_order_mock },
}));
vi.mock("#/errors/report", () => ({ report_degraded: report_degraded_mock }));

const { handle_paypal_order_capture } = await import("./handle-paypal-order");

const job = { order_id: "O-1", don_id: "d1" };
const orders_422 = (issue: string) =>
  new PayPalApiError(
    "capture order",
    422,
    JSON.stringify({ name: "UNPROCESSABLE_ENTITY", details: [{ issue }] })
  );

beforeEach(() => {
  vi.clearAllMocks();
  get_order_mock.mockResolvedValue({ id: "O-1", status: "APPROVED" });
  capture_order_mock.mockResolvedValue({ id: "O-1", status: "COMPLETED" });
});

describe("handle_paypal_order_capture", () => {
  it("captures an order still approved, under the browser's own request id", async () => {
    await handle_paypal_order_capture(job);

    expect(get_order_mock).toHaveBeenCalledWith("O-1");
    expect(capture_order_mock).toHaveBeenCalledExactlyOnceWith(
      "O-1",
      "capture-O-1"
    );
  });

  it.each(["COMPLETED", "VOIDED"])(
    "leaves an order paypal already shows %s alone",
    async (status) => {
      get_order_mock.mockResolvedValue({ id: "O-1", status });

      await handle_paypal_order_capture(job);

      expect(capture_order_mock).not.toHaveBeenCalled();
    }
  );

  it("returns quietly when the browser's capture wins the race", async () => {
    capture_order_mock.mockRejectedValue(orders_422("ORDER_ALREADY_CAPTURED"));

    await handle_paypal_order_capture(job);

    expect(report_degraded_mock).not.toHaveBeenCalled();
  });

  it("reports a payer whose funding paypal refused", async () => {
    capture_order_mock.mockRejectedValue(orders_422("INSTRUMENT_DECLINED"));

    await handle_paypal_order_capture(job);

    expect(report_degraded_mock).toHaveBeenCalledOnce();
    expect(report_degraded_mock.mock.calls[0]![1]).toEqual({
      order_id: "O-1",
      don_id: "d1",
      issue: "INSTRUMENT_DECLINED",
    });
  });

  it("returns quietly for an order paypal no longer has", async () => {
    get_order_mock.mockRejectedValue(
      new PayPalApiError("get order", 404, '{"name":"RESOURCE_NOT_FOUND"}')
    );

    await handle_paypal_order_capture(job);

    expect(capture_order_mock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a capture paypal answers 5xx",
      new PayPalApiError("capture order", 503, "{}"),
    ],
    [
      "a capture already in progress",
      orders_422("PREVIOUS_REQUEST_IN_PROGRESS"),
    ],
  ])("throws on %s, so qstash retries", async (_, err) => {
    capture_order_mock.mockRejectedValue(err);

    await expect(handle_paypal_order_capture(job)).rejects.toBe(err);
  });
});
