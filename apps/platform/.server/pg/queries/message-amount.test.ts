import { describe, expect, test } from "vitest";
import { message_amount_usd } from "./message-amount";

describe("message_amount_usd", () => {
  test("a peso base is divided by the rate before it is shown as dollars", () => {
    expect(message_amount_usd(500, 50)).toBe(10);
  });

  test("a dollar base at a rate of one stays the same figure", () => {
    expect(message_amount_usd(40, 1)).toBe(40);
  });

  test("a missing rate leaves the figure off", () => {
    expect(message_amount_usd(500, null)).toBeNull();
    expect(message_amount_usd(500, 0)).toBeNull();
    expect(message_amount_usd(null, 1)).toBeNull();
  });
});
