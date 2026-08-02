import { describe, expect, test } from "vitest";
import { is_gift_returned } from "./status";

describe("is_gift_returned", () => {
  test("a voided event says so, whatever the donation reads", () => {
    expect(is_gift_returned("settled", "2026-08-01T00:00:00Z")).toBe(true);
  });

  test("a refunded donation with no event still counts", () => {
    // the case the stamp alone misses: refunded before the workflow was ever
    // entered, so there is no row to carry `voided_at` — and the donor is
    // looking at the filing surface regardless
    expect(is_gift_returned("refunded")).toBe(true);
    expect(is_gift_returned("refunded_loss")).toBe(true);
  });

  test("a live gift is not returned", () => {
    expect(is_gift_returned("settled")).toBe(false);
    expect(is_gift_returned("confirmed", null)).toBe(false);
  });

  test("an unpaid donation is not a returned one", () => {
    // nothing came in, so nothing went back — the screen has other copy for it
    expect(is_gift_returned("intent")).toBe(false);
  });
});
