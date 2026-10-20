import { describe, expect, test } from "vitest";
import { OFFLINE_SOURCE, RECORDED_BY_HAND } from "@/donations/offline";
import { origin_text } from "./helpers";

describe("origin_text", () => {
  test("names a hand-recorded gift and leaves the other channels", () => {
    expect(origin_text(OFFLINE_SOURCE)).toBe(RECORDED_BY_HAND);
    expect(origin_text("bg-widget")).toBe("Donation Form");
    expect(origin_text("bg-marketplace")).toBe("Marketplace");
  });
});
