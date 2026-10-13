import { describe, expect, test } from "vitest";
import { country_code } from "./countries";

describe("country_code", () => {
  test.each([
    ["United Kingdom", "GB"],
    ["united states", "US"],
    ["  CZECHIA ", "CZ"],
  ])("%j is %s", (name, code) => {
    expect(country_code(name)).toBe(code);
  });

  test.each(["", "Atlantis", "GB"])("%j maps to no code", (name) => {
    expect(country_code(name)).toBeUndefined();
  });
});
