import { describe, expect, it } from "vitest";
import { paypal_capture_outcome } from "./paypal-capture";

const with_status = (status?: string) => ({
  purchase_units: [{ payments: { captures: [{ status }] } }],
});

describe("paypal_capture_outcome", () => {
  it.each([
    ["COMPLETED", "taken"],
    ["PENDING", "taken"],
    ["DECLINED", "declined"],
    ["FAILED", "declined"],
    ["PARTIALLY_REFUNDED", "unknown"],
    [undefined, "unknown"],
  ])("%s is %s", (status, outcome) => {
    expect(paypal_capture_outcome(with_status(status))).toEqual({
      outcome,
      status,
    });
  });

  it("a body with no capture at all is unknown", () => {
    expect(paypal_capture_outcome({}).outcome).toBe("unknown");
  });
});
