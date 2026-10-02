import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
// sticky, z-index and scroll-padding are all stylesheet behaviour — without the
// real css the header is a static block and every case passes or fails on
// nothing.
import "#/index.css";
import { PublicLayout } from "./public-layout";

// far taller than any test viewport, so a 2000px scroll has room to land
function TallPage() {
  return (
    <div>
      {Array.from({ length: 300 }, (_, i) => (
        <p key={i}>section {i}</p>
      ))}
    </div>
  );
}

function layout_stub() {
  return createRoutesStub([
    {
      path: "/",
      Component: PublicLayout,
      HydrateFallback: () => null,
      children: [
        // marketing chrome, with the announcement bar above the header
        { path: "about-us", Component: TallPage },
        // minimal chrome: AppHeader, no bar
        { path: "marketplace", Component: TallPage },
      ],
    },
  ]);
}

afterEach(() => {
  window.scrollTo(0, 0);
});

describe("PublicLayout header", () => {
  test.each([
    ["marketing", "/about-us"],
    ["minimal", "/marketplace"],
  ])(
    "stays pinned to the top of the viewport on a %s route",
    async (_, path) => {
      const Stub = layout_stub();
      const screen = await render(
        <Stub initialEntries={[path]} future={{ v8_middleware: true }} />
      );
      await expect.element(screen.getByText("section 299")).toBeInTheDocument();

      window.scrollTo(0, 2000);
      expect(window.scrollY).toBe(2000);

      const header = screen.container.querySelector("header") as HTMLElement;
      const { top } = header.getBoundingClientRect();
      // -top-px: stuck one pixel above the edge, not scrolled off with the page
      expect(top).toBeLessThanOrEqual(0);
      expect(top).toBeGreaterThan(-2);
    }
  );

  test("the announcement bar scrolls away while the header pins", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );
    await expect.element(screen.getByText("section 299")).toBeInTheDocument();

    window.scrollTo(0, 2000);

    const bar = screen.container.querySelector(
      '[data-banner="ncnp-endorsement"]'
    ) as HTMLElement;
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
  });

  test("hash jumps land below the pinned header, not under it", async () => {
    const Stub = layout_stub();
    await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );

    expect(getComputedStyle(document.documentElement).scrollPaddingTop).toBe(
      "64px"
    );
  });
});
