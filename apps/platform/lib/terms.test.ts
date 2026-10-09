import { describe, expect, test } from "vitest";
import { TERMS_EFFECTIVE, terms_effective_at } from "./terms";

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
