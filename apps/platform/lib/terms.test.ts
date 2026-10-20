import { afterEach, describe, expect, test, vi } from "vitest";
import {
  recovery_covers,
  TERMS_POSTED,
  TERMS_RECOVERY_FROM,
  terms_date_label,
  terms_effective_at,
  terms_recovery_at,
} from "./terms";

describe("terms_effective_at", () => {
  test("a date in daylight time is midnight four hours behind utc", () => {
    expect(terms_effective_at("2026-10-23")).toBe("2026-10-23T04:00:00.000Z");
  });

  test("the shipped date's instant reads as midnight in New York on that date", () => {
    const at = terms_effective_at(TERMS_RECOVERY_FROM);

    // sv-SE prints iso order, a separate path from the one under test
    expect(
      new Date(at!).toLocaleString("sv-SE", { timeZone: "America/New_York" })
    ).toBe(`${TERMS_RECOVERY_FROM} 00:00:00`);
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

describe("terms_recovery_at", () => {
  test("a posting whose seventh day is later than the fixed date uses that day", () => {
    expect(terms_recovery_at("2026-09-18", "2026-09-15")).toBe(
      "2026-09-22T04:00:00.000Z"
    );
  });

  test("the fixed date wins when seven days after posting is sooner", () => {
    expect(terms_recovery_at("2026-09-18", "2026-09-01")).toBe(
      "2026-09-18T04:00:00.000Z"
    );
  });

  test("a blank posting is the fixed date alone", () => {
    expect(terms_recovery_at(TERMS_RECOVERY_FROM, "")).toBe(
      terms_effective_at(TERMS_RECOVERY_FROM)
    );
    expect(terms_recovery_at(TERMS_RECOVERY_FROM, "   ")).toBe(
      terms_effective_at(TERMS_RECOVERY_FROM)
    );
  });

  test("the shipped posting's seventh day is midnight in New York on the fixed date", () => {
    const at = terms_recovery_at(TERMS_RECOVERY_FROM, TERMS_POSTED);

    expect(at).toBe(terms_effective_at(TERMS_RECOVERY_FROM));
    expect(at).toBe("2026-10-23T04:00:00.000Z");
  });

  test("an unparsable fixed date reaches nobody", () => {
    expect(terms_recovery_at("soon", TERMS_POSTED)).toBeNull();
  });
});

describe("recovery_covers", () => {
  const cutoff = "2026-10-23T04:00:00.000Z";

  test("the cutoff instant and anything after it is covered", () => {
    expect(recovery_covers(cutoff)).toBe(true);
    expect(recovery_covers("2026-10-23T16:00:00.000Z")).toBe(true);
  });

  test("a checkout that pays before the cutoff is not covered", () => {
    expect(recovery_covers("2026-10-23T03:59:59.000Z")).toBe(false);
  });

  test("an unparsable instant covers nothing", () => {
    expect(recovery_covers(null)).toBe(false);
    expect(recovery_covers(undefined)).toBe(false);
    expect(recovery_covers("soon")).toBe(false);
  });
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
    expect(terms_date_label(TERMS_RECOVERY_FROM)).toMatch(
      /^[A-Z][a-z]+ \d{1,2}, \d{4}$/
    );
  });

  test("a non-date comes back as given", () => {
    expect(terms_date_label("2026-02-30")).toBe("2026-02-30");
  });
});
