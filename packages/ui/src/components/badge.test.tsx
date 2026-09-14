import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Badge } from "./badge";

describe("Badge", () => {
  test("renders its label with the tone it was given", async () => {
    const screen = await render(<Badge tone="success">Completed</Badge>);
    const badge = screen.getByText("Completed");
    await expect.element(badge).toBeVisible();
    await expect.element(badge).toHaveAttribute("data-tone", "success");
  });
});
