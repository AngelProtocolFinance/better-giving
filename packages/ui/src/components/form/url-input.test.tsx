import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { UrlInput } from "./url-input";

describe("UrlInput", () => {
  it("updates the value as the visitor types", async () => {
    const screen = await render(<UrlInput label="Website" name="url" />);
    const input = screen.getByLabelText("Website");

    await input.fill("tiktok.com");

    await expect.element(input).toHaveValue("tiktok.com");
  });

  it("marks the control invalid when an error is passed", async () => {
    const screen = await render(
      <UrlInput label="Website" name="url" error="Invalid url" />
    );

    await expect
      .element(screen.getByLabelText("Website"))
      .toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the control when the prefix is clicked", async () => {
    const screen = await render(<UrlInput label="Website" name="url" />);

    await screen.getByText("https://").click();

    await expect.element(screen.getByLabelText("Website")).toHaveFocus();
  });
});
