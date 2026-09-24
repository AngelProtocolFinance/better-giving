import { describe, expect, test } from "vitest";
import { fund_is_open } from "./is-open";

const now = new Date("2027-09-23T12:00:00.000Z");

describe("fund_is_open", () => {
  test("an active fund with no expiration is open", () => {
    expect(fund_is_open({ active: true, expiration: null }, now)).toBe(true);
    expect(fund_is_open({ active: true }, now)).toBe(true);
  });

  test("an inactive fund is closed however far off its expiration is", () => {
    const f = { active: false, expiration: "2099-01-01T00:00:00.000Z" };
    expect(fund_is_open(f, now)).toBe(false);
  });

  test("closes once its expiration has passed", () => {
    const f = { active: true, expiration: "2027-09-23T11:59:59.999Z" };
    expect(fund_is_open(f, now)).toBe(false);
  });

  test("stays open while its expiration is still ahead", () => {
    const f = { active: true, expiration: "2027-09-23T12:00:00.001Z" };
    expect(fund_is_open(f, now)).toBe(true);
  });

  test("a microsecond-precision expiration just after now is open", () => {
    // "…00.000003Z" sorts below "…00.000Z" as text
    const f = { active: true, expiration: "2027-09-23T12:00:00.000003Z" };
    expect(fund_is_open(f, now)).toBe(true);
  });
});
