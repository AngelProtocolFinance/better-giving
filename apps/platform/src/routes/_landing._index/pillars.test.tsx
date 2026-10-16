import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Pillars } from "./pillars";

const ctas = [
  "Explore the product",
  "See pricing",
  "See every gift type",
  "Grow your funds",
  "Read the code",
  "Unlock U.S. donors",
];

describe("Pillars", () => {
  test("each tile is one link, named by its CTA text", async () => {
    const Stub = createRoutesStub([
      { path: "/", Component: Pillars, HydrateFallback: () => null },
    ]);
    const screen = await render(<Stub />);

    // the whole tile is the link's hit area, so a second link in a tile would
    // sit under the first and never take a click
    const links = screen.getByRole("link");
    await expect.element(links.first()).toBeVisible();
    expect(links.all()).toHaveLength(ctas.length);
    for (const [i, cta] of ctas.entries()) {
      await expect.element(links.nth(i)).toHaveAccessibleName(cta);
    }
  });
});
