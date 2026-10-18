import { describe, expect, it } from "vitest";
import {
  closed_body,
  donor_label,
  ended_label,
  goal_amount,
  goal_percent,
  percent_label,
  shown_end,
  tag_label,
  time_left,
} from "./format";

describe("campaign page copy", () => {
  it("hides the tag for other and for a missing type", () => {
    expect(tag_label(null)).toBeNull();
    expect(tag_label("other")).toBeNull();
    expect(tag_label("year_end")).toBe("Year-end");
    expect(tag_label("monthly")).toBe("Monthly");
  });

  it("resolves a fixed goal, a smart goal, and no goal", () => {
    expect(goal_amount(undefined, 0)).toBeNull();
    expect(goal_amount("0", 0)).toBeNull();
    expect(goal_amount("5000", 0)).toBe(5000);
    expect(goal_amount("smart", 50)).toBe(100);
    expect(goal_amount("smart", 100)).toBe(200);
  });

  it("floors the percent and keeps counting past the goal", () => {
    expect(goal_percent(0, 5000)).toBe(0);
    expect(goal_percent(184_260, 250_000)).toBe(73);
    expect(goal_percent(300, 100)).toBe(300);
  });

  it("reads a started gift under 1% as <1% and leaves a real zero at 0%", () => {
    expect(percent_label(0, 5000)).toBe("0%");
    expect(percent_label(25, 5000)).toBe("<1%");
    expect(percent_label(49, 5000)).toBe("<1%");
    expect(percent_label(50, 5000)).toBe("1%");
    expect(percent_label(999, 1000)).toBe("99%");
    expect(percent_label(184_260, 250_000)).toBe("73%");
    expect(percent_label(300, 100)).toBe("300%");
  });

  it("singularizes one donor and groups the rest", () => {
    expect(donor_label(0)).toBe("0 donors");
    expect(donor_label(1)).toBe("1 donor");
    expect(donor_label(1284)).toBe("1,284 donors");
  });

  it("counts down in days, then hours, then under an hour", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(time_left("2026-10-30T12:00:00.000Z", now)).toBe("12 days left");
    expect(time_left("2026-10-19T12:00:00.000Z", now)).toBe("1 day left");
    expect(time_left("2026-10-19T11:00:00.000Z", now)).toBe("23 hours left");
    expect(time_left("2026-10-18T13:00:00.000Z", now)).toBe("1 hour left");
    expect(time_left("2026-10-18T12:30:00.000Z", now)).toBe(
      "Less than an hour left"
    );
    expect(time_left("2026-10-18T12:00:00.000Z", now)).toBeNull();
  });

  it("formats an ended date in UTC and omits it when none is stored", () => {
    expect(ended_label(null)).toBe("Ended");
    expect(ended_label("2026-10-12T23:59:59.999Z")).toBe("Ended Oct 12, 2026");
    expect(closed_body(null)).toBe(
      "It no longer takes donations. Thank you to everyone who gave."
    );
    expect(closed_body("2026-10-12T23:59:59.999Z")).toBe(
      "It stopped taking donations on Oct 12, 2026. Thank you to everyone who gave."
    );
  });

  it("drops a future end date after an early close", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(shown_end("2026-12-31T23:59:59.999Z", now)).toBeNull();
    expect(shown_end("2026-10-12T23:59:59.999Z", now)).toBe(
      "2026-10-12T23:59:59.999Z"
    );
    expect(shown_end(null, now)).toBeNull();
  });
});
