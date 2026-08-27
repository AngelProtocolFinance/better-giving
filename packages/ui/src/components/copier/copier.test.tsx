import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Copier } from "./copier";

// wcag 2.5.3: the accessible name has to contain the visible text, or voice
// control cannot say the words on the button. zag supplies a name of its own
// through `translations.triggerLabel`, so "no aria-label" is not the same as
// "no name" — these assert what a user actually gets, per shape of call site.
describe("Copier: accessible name", () => {
  test("a glyph-only trigger is named 'Copy'", async () => {
    const screen = await render(<Copier text="abc" />);

    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName("Copy");
  });

  test("visible children are the name, unshadowed", async () => {
    const screen = await render(<Copier text="abc">Copy Instructions</Copier>);

    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName("Copy Instructions");
  });

  test("an explicit label wins over both", async () => {
    const screen = await render(<Copier text="abc" label="Copy API Key" />);

    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName("Copy API Key");
  });
});
