import { describe, expect, it } from "vitest";
import { first_sentence } from "./first-sentence";

describe("first_sentence", () => {
  it.each([
    ["We dig wells. Then we maintain them.", "We dig wells."],
    ["Why wells? Because water.", "Why wells?"],
    ["Water now! Every village.", "Water now!"],
    [
      "St. Jude's Hospital treats children. It never bills them.",
      "St. Jude's Hospital treats children.",
    ],
    [
      "We serve U.S. veterans and their families. Since 1990.",
      "We serve U.S. veterans and their families.",
    ],
    [
      "Founded by Dr. Ana Ruiz and J. Ortiz in 1990. We grew.",
      "Founded by Dr. Ana Ruiz and J. Ortiz in 1990.",
    ],
    [
      "Tools, e.g. pumps, for every village. More later.",
      "Tools, e.g. pumps, for every village.",
    ],
    ["No closing mark here", "No closing mark here"],
    ["Version 2.5 ships soon. Then 3.", "Version 2.5 ships soon."],
    ["First paragraph only\n\nSecond. Paragraph.", "First paragraph only"],
  ])("%j → %j", (text, deck) => {
    expect(first_sentence(text)).toBe(deck);
  });
});
