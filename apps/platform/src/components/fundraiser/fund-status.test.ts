import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { status } from "./fund-status";

describe("fund status", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const oct_1 = "2027-10-01T00:00:00.000Z";

  test("counts down to the end of the end date everywhere", () => {
    vi.setSystemTime(new Date("2027-09-30T12:00:00.000Z"));
    expect(status(oct_1, true, 0)).toEqual({
      active: true,
      text: "ends in 2 days",
    });
  });

  test("is still running late on its end date in Pacific time", () => {
    vi.setSystemTime(new Date("2027-10-02T06:00:00.000Z"));
    expect(status(oct_1, true, 0)).toEqual({
      active: true,
      text: "ends in about 6 hours",
    });
  });

  test("has expired once its end date has ended everywhere", () => {
    vi.setSystemTime(new Date("2027-10-02T12:00:00.000Z"));
    expect(status(oct_1, true, 0)).toEqual({ active: false, text: "expired" });
    expect(status(oct_1, true, 500)).toEqual({
      active: false,
      text: "completed",
    });
  });
});
