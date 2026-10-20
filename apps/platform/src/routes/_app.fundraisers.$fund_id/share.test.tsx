import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Share } from "./share";

describe("Share", () => {
  test("the default render keeps the heading", async () => {
    const screen = await render(
      <Share recipientName="Harbor Clinic" url="https://better.giving/c" />
    );
    await expect
      .element(screen.getByRole("heading", { name: "Spread the word!" }))
      .toBeVisible();
    await expect
      .element(screen.getByText(/Encourage your friends/))
      .toBeVisible();
  });

  test("the button trigger opens the networks and skips the invested line", async () => {
    const screen = await render(
      <Share
        trigger="button"
        recipientName="Harbor Clinic"
        url="https://better.giving/c"
      />
    );
    expect(screen.getByText("Spread the word!").query()).toBeNull();
    expect(screen.getByText(/Encourage your friends/).query()).toBeNull();

    await screen.getByRole("button", { name: "Share", exact: true }).click();
    await userEvent.click(
      screen.getByRole("button", { name: "Share on LinkedIn" })
    );
    const prompt = screen.getByText(/Donate to/);
    await expect.element(prompt).toBeVisible();
    expect(prompt.element().textContent).not.toContain(
      "Every gift is invested"
    );
    expect(prompt.element().textContent).toContain("Donate to");
    expect(prompt.element().textContent).toContain("Harbor Clinic");
  });
});
