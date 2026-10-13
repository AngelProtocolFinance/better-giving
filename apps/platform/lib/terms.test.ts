import { afterEach, describe, expect, test, vi } from "vitest";
import { TERMS_EFFECTIVE, terms_date_label, terms_effective_at } from "./terms";

describe("terms_effective_at", () => {
  test("a date in daylight time is midnight four hours behind utc", () => {
    expect(terms_effective_at("2026-10-18")).toBe("2026-10-18T04:00:00.000Z");
  });

  test("the shipped date's instant reads as midnight in New York on that date", () => {
    const at = terms_effective_at(TERMS_EFFECTIVE);

    // sv-SE prints iso order, a separate path from the one under test
    expect(
      new Date(at!).toLocaleString("sv-SE", { timeZone: "America/New_York" })
    ).toBe(`${TERMS_EFFECTIVE} 00:00:00`);
  });

  test("a date in standard time is midnight five hours behind utc", () => {
    expect(terms_effective_at("2026-01-15")).toBe("2026-01-15T05:00:00.000Z");
  });

  test("the day the clocks go back is still its own midnight", () => {
    expect(terms_effective_at("2026-11-01")).toBe("2026-11-01T04:00:00.000Z");
  });

  test.each(["", "2026-02-30", "2026-10-16T00:00:00Z", "10/16/2026", "soon"])(
    "%j is no date",
    (date) => {
      expect(terms_effective_at(date)).toBeNull();
    }
  );
});

describe("terms_date_label", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    // assigning undefined would store the string "undefined"
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  test("prints the date the way the terms pages do", () => {
    expect(terms_date_label("2026-10-16")).toBe("October 16, 2026");
  });

  test("keeps the calendar day west of utc, where midnight utc is the day before", async () => {
    // the formatter is built at import, so the zone must change before a fresh import
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    const fresh = await import("./terms");

    expect(fresh.terms_date_label("2027-01-01")).toBe("January 1, 2027");
  });

  test("the shipped date prints as a long date, not as the raw string", () => {
    expect(terms_date_label(TERMS_EFFECTIVE)).toMatch(
      /^[A-Z][a-z]+ \d{1,2}, \d{4}$/
    );
  });

  test("a non-date comes back as given", () => {
    expect(terms_date_label("2026-02-30")).toBe("2026-02-30");
  });
});
