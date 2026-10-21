import { describe, expect, test } from "vitest";
import { origin_text } from "./helpers";

describe("origin_text", () => {
  test("names the widget and marketplace channels", () => {
    expect(origin_text("bg-widget")).toBe("Donation Form");
    expect(origin_text("bg-marketplace")).toBe("Marketplace");
  });
});
