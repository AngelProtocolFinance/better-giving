import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { popup_shell } from "./popup";
import { Content, Tooltip } from "./tooltip";

describe("Tooltip", () => {
  test("Content carries the shell, and the caller's classes ride after it", async () => {
    const screen = await render(
      <Tooltip tip={<Content className="max-w-xs text-xs">a tip</Content>}>
        <button type="button">trigger</button>
      </Tooltip>
    );
    await screen.getByRole("button", { name: "trigger" }).click();
    // portaled, so looked up on the page rather than the render container
    const body = page.getByText("a tip");
    await expect.element(body).toBeVisible();
    const cls = body.element().className.split(/\s+/);
    for (const c of popup_shell.split(" ")) expect(cls).toContain(c);
    expect(cls).toContain("max-w-xs");
    expect(cls).toContain("text-xs");
  });
});
