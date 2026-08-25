import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
// the scrim's height is a tailwind arbitrary value, so the real stylesheet has
// to be loaded for the measurement below to mean anything.
import "#/index.css";
import { MarketingHeader } from "./marketing-header";

// the header as the layouts mount it: sticky, in a grid whose first track is
// the declared 4rem header row.
function stub() {
  return createRoutesStub([
    {
      path: "/",
      Component: () => (
        <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[4rem_1fr] min-h-dvh">
          <MarketingHeader classes="sticky z-sticky -top-px" />
          <main />
        </div>
      ),
      HydrateFallback: () => null,
    },
  ]);
}

describe("mobile menu scrim", () => {
  test("is a viewport minus the header, so it ends at the fold instead of overhanging", async () => {
    const Stub = stub();
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    await screen.getByRole("button", { name: /navigation menu/i }).click();

    const scrim = screen
      .getByRole("button", { name: /close navigation menu/i })
      .element();
    const header = screen.container.querySelector("header");
    if (!header) throw new Error("header not found");

    const header_h = header.getBoundingClientRect().height;
    // the scrim hangs off the header's bottom edge (`top-full`), so a flat
    // `h-dvh` puts its bottom a header height past the fold — and a further
    // banner height past it while the announcement bar is mounted above an
    // unscrolled page. subtracting the containing block keeps that overhang out
    // of the document's scrollable area.
    const overhang =
      scrim.getBoundingClientRect().height - (window.innerHeight - header_h);
    // 1px of slack for the subpixel header box (its bottom border). the
    // regression this pins is a whole header height (64px), not a rounding step.
    expect(Math.abs(overhang)).toBeLessThanOrEqual(1);
  });
});
