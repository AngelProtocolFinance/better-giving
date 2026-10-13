import { describe, expect, test } from "vitest";
import { descriptor_suffix } from "./descriptor";

describe("descriptor_suffix", () => {
  test("uppercases a short latin name", () => {
    expect(descriptor_suffix("Red Cross", "BG")).toBe("RED CROSS");
  });

  // prefix + "* " + suffix ≤ 22, so a 10-char prefix leaves 10
  test.each([
    ["BETTERGIVE", "Save the Children Fund", "SAVE THE C"],
    ["BETTERGIV", "Habitat for Humanity", "HABITAT FOR"],
    // 18 chars end on a space, which isn't left trailing
    ["BG", "Save the Children Fund International", "SAVE THE CHILDREN"],
  ])("with prefix %s, cuts %j to %j", (prefix, name, suffix) => {
    expect(descriptor_suffix(name, prefix)).toBe(suffix);
  });

  test.each([
    ["accents", "Fundación Niños", "FUNDACION NINOS"],
    ["latin letters with no decomposition", "Øresund Æble", "ORESUND AEBLE"],
    ["stripe's disallowed six", `Kids' "Hope" <*> \\ Home`, "KIDS HOPE HOME"],
    ["kept punctuation", "St. Jude & Co-op", "ST. JUDE & CO-OP"],
    [
      "a script stripe can't print, between words",
      "Hope 希望 House",
      "HOPE HOUSE",
    ],
    ["an emoji", "🌱 Green Earth", "GREEN EARTH"],
  ])("%s: %j reads %j", (_case, name, suffix) => {
    expect(descriptor_suffix(name, "BG")).toBe(suffix);
  });

  // undefined means "set no suffix", which leaves the prefix alone
  test.each([
    ["all CJK", "希望基金会"],
    ["all disallowed", `<>\\'"*`],
    ["no letter", "1234 - 5678"],
    ["blank", "   "],
  ])("%s yields no suffix", (_case, name) => {
    expect(descriptor_suffix(name, "BG")).toBeUndefined();
  });
});
