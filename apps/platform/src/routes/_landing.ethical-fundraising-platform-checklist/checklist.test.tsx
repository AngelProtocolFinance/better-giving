import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Checklist, verdict_for } from "./checklist";
import { flag_total, items, total } from "./data";

const STORE_KEY = "bg-ethics-checklist-v1";

// a flashpoint and a plain item, addressed by the copy a visitor actually reads
const FLASHPOINT = /written consent from an authorized representative/;
const PLAIN = /Campaign pages link to our own website/;

beforeEach(() => localStorage.removeItem(STORE_KEY));
afterEach(() => localStorage.removeItem(STORE_KEY));

describe("verdict_for", () => {
  test("nothing ticked reads as unstarted, not as a clean bill", () => {
    const v = verdict_for(0, 0);
    expect(v.headline).toBe("Start ticking boxes");
    expect(v.tally).toBe(`${flag_total} flashpoints to check`);
    expect(v.tone).toBe("neutral");
  });

  test("an unchecked flashpoint outranks every other item ticked", () => {
    const v = verdict_for(total - 1, flag_total - 1);
    expect(v.headline).toBe("Gaps to raise with your platform");
    expect(v.tally).toBe("1 flashpoint unchecked");
    expect(v.tone).toBe("warning");
  });

  test("flashpoints clear with items left is its own verdict", () => {
    const v = verdict_for(flag_total, flag_total);
    expect(v.headline).toBe("No red flags, with a few items left");
    expect(v.tally).toBe("All flashpoints clear");
    expect(v.tone).toBe("success");
  });

  test("only a full sheet meets every principle", () => {
    expect(verdict_for(total, flag_total).headline).toBe(
      "Meets every principle"
    );
  });
});

describe("Checklist", () => {
  test("starts empty, with every question on the page", async () => {
    const screen = await render(<Checklist />);

    expect(
      screen.container.querySelectorAll("input[type=checkbox]")
    ).toHaveLength(items.length);
    await expect.element(screen.getByText(`of ${total}`)).toBeVisible();
    await expect
      .element(screen.getByText(`${flag_total} flashpoints to check`))
      .toBeVisible();
  });

  test("a ticked flashpoint counts twice: toward the score and off the tally", async () => {
    const screen = await render(<Checklist />);

    await screen.getByLabelText(FLASHPOINT).click();

    await expect
      .element(screen.getByText(`${flag_total - 1} flashpoints unchecked`))
      .toBeVisible();
    await expect
      .element(screen.getByText("Gaps to raise with your platform"))
      .toBeVisible();
  });

  test("a tick is written to the store", async () => {
    const screen = await render(<Checklist />);

    await screen.getByLabelText(PLAIN).click();

    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]")).toEqual([
      "partnership-links-out",
    ]);
  });

  test("a stored tick comes back on the next visit", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(["partnership-links-out"]));

    const screen = await render(<Checklist />);

    await expect.element(screen.getByLabelText(PLAIN)).toBeChecked();
  });

  test("reset clears both the page and the store", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(["partnership-links-out"]));
    const screen = await render(<Checklist />);

    await screen.getByRole("button", { name: "Reset all" }).click();

    await expect.element(screen.getByLabelText(PLAIN)).not.toBeChecked();
    expect(localStorage.getItem(STORE_KEY)).toBe("[]");
  });

  test("an id that no longer exists is dropped, never counted", async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(["gone", "consent-branding"])
    );

    const screen = await render(<Checklist />);

    // 1, not 2 — a stale id would push the score past the question count
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(`1 of ${total}`);
  });
});
