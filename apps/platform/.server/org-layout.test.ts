import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOrgShape } from "@/org-shape";

const jev_choice = vi.hoisted(() => vi.fn());
vi.mock("./jev", () => ({ jev_choice }));

const { pick_layout } = await import("./org-layout");

/** short story, one row: the thresholds say poster */
const shape: IOrgShape = {
  story_chars: 120,
  tagline_chars: 40,
  name_chars: 18,
  has_banner: true,
  has_logo: false,
  campaigns: 1,
  fundraisers: 0,
  programs: 2,
  videos: 0,
};

describe("pick_layout", () => {
  beforeEach(() => jev_choice.mockReset());

  it("takes Jev's layout over the thresholds", async () => {
    jev_choice.mockResolvedValueOnce("feature");

    expect(await pick_layout(shape)).toEqual({ layout: "feature", by: "jev" });
  });

  it("falls back to the thresholds when Jev has no answer", async () => {
    jev_choice.mockResolvedValueOnce(null);

    expect(await pick_layout(shape)).toEqual({
      layout: "poster",
      by: "threshold",
    });
  });

  it("takes card from Jev too", async () => {
    jev_choice.mockResolvedValueOnce("card");

    expect(await pick_layout(shape)).toEqual({ layout: "card", by: "jev" });
  });

  it("sends Jev the measures alone, asking for one of the five layouts", async () => {
    jev_choice.mockResolvedValueOnce(null);

    await pick_layout(shape);

    const [state, question, timeout] = jev_choice.mock.calls[0]!;
    expect(state).toEqual({ ...shape });
    expect(Object.keys(question.criteria).sort()).toEqual([
      "card",
      "feature",
      "hub",
      "letter",
      "poster",
    ]);
    // jev_choice's own default timeout
    expect(timeout).toBeUndefined();
  });
});
