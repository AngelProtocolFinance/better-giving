import { expect } from "vitest";
import { userEvent } from "vitest/browser";
import type { RenderResult } from "vitest-browser-react";

/** from an open Share chooser, pick Facebook and read what its prompt would
 * share: who it asks to donate to, and the address the network is handed */
export async function shared_via_facebook(screen: RenderResult) {
  await userEvent.click(
    screen.getByRole("button", { name: "Share on Facebook" })
  );
  const prompt = screen.getByText(/Donate to/);
  await expect.element(prompt).toBeVisible();
  const recipient = /^Donate to (.+?) on /.exec(
    prompt.element().textContent ?? ""
  )?.[1];
  const href = screen
    .getByRole("link", { name: "Share now" })
    .element()
    .getAttribute("href");
  return {
    recipient,
    url: new URL(href ?? "").searchParams.get("href"),
  };
}
