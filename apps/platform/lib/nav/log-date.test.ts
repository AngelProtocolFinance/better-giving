import { afterEach, describe, expect, test, vi } from "vitest";
import { nav_log_date } from "./log-date";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nav_log_date", () => {
  test("hands out distinct stamps inside one millisecond", () => {
    // a fund settling three lock-allocating members inside one transaction —
    // the clock does not move between them, and `nav_logs.date` is the primary
    // key, so identical stamps are a 23505 that fails the whole settlement
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const stamps = [nav_log_date(), nav_log_date(), nav_log_date()];

    expect(new Set(stamps).size).toBe(3);
  });

  test("the stamps stay in the order they were handed out", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const stamps = [nav_log_date(), nav_log_date(), nav_log_date()];

    // the column orders as well as identifies — `nav_log_append` reads the head
    // by `date desc` for the snapshot its price invariant is checked against
    expect([...stamps].sort()).toEqual(stamps);
  });

  test("follows the clock once it has moved past the last stamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    nav_log_date();

    vi.spyOn(Date, "now").mockReturnValue(1_800_000_060_000);
    // real time, not last + 1: the stamp is a timestamp people read, so it may
    // only run ahead of the clock far enough to stay distinct
    expect(nav_log_date()).toBe(new Date(1_800_000_060_000).toISOString());
  });

  test("never goes backwards when the clock does", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
    const first = nav_log_date();

    // ntp correction, or a lambda resuming on a host with a different clock
    vi.spyOn(Date, "now").mockReturnValue(1_899_999_999_000);
    const second = nav_log_date();

    expect(second > first).toBe(true);
  });
});
