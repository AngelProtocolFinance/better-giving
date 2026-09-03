import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Content, HoverCard } from "./hover-card";
import { popup_shell } from "./popup";

describe("HoverCard", () => {
  test("Content carries the shell, and the caller's classes ride after it", async () => {
    const screen = await render(
      <HoverCard tip={<Content className="w-80">a card</Content>}>
        <button type="button">trigger</button>
      </HoverCard>
    );
    await screen.getByRole("button", { name: "trigger" }).hover();
    // portaled, so looked up on the page rather than the render container
    const body = page.getByText("a card");
    await expect.element(body).toBeVisible();
    const cls = body.element().className.split(/\s+/);
    for (const c of popup_shell.split(" ")) expect(cls).toContain(c);
    expect(cls).toContain("w-80");
  });
});
