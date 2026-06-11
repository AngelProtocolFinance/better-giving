import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Copier } from "./copier";

// Mock copy button
const CopyButton = () => {
  const textToCopy = "S4mple-Text+2_Copy0";
  return <Copier text={textToCopy} />;
};

describe("Copier component test:", () => {
  test("copies correct text and able to change appearance when clicked", async () => {
    const write_text = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    const screen = await render(<CopyButton />);

    // Looks for the copy button
    const button = screen.getByRole("button");

    // Clicks the copy button
    await button.click();

    expect(write_text).toHaveBeenCalledWith("S4mple-Text+2_Copy0");

    // Expects the button to change appearance once clicked
    await expect.element(screen.getByLabelText(/copied/i)).toBeVisible();

    // Expects the button to revert back to it's original appearance
    await expect.element(screen.getByLabelText(/copy/i)).toBeVisible();
  });
});
