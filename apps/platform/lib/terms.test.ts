import { afterEach, describe, expect, test } from "vitest";
import { TERMS_EFFECTIVE, terms_date_label, terms_effective_at } from "./terms";

describe("terms_effective_at", () => {
  test("the terms take effect at midnight in New York on their date", () => {
    expect(TERMS_EFFECTIVE).toBe("2026-10-16");
    expect(terms_effective_at(TERMS_EFFECTIVE)).toBe(
      "2026-10-16T04:00:00.000Z"
    );
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
    process.env.TZ = tz;
  });

  test("prints the date the way the terms pages do", () => {
    expect(terms_date_label("2026-10-16")).toBe("October 16, 2026");
  });

  test("keeps the calendar day west of utc, where midnight utc is the day before", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(terms_date_label("2027-01-01")).toBe("January 1, 2027");
  });

  test("a non-date comes back as given", () => {
    expect(terms_date_label("2026-02-30")).toBe("2026-02-30");
  });
});
