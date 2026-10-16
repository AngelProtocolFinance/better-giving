import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
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
        <p key={i} id={`section-${i}`}>
          section {i}
        </p>
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

function inert_of(el: Element) {
  return el.closest("[inert]") !== null;
}

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

  test.each([
    ["marketing", "/about-us"],
    ["minimal", "/marketplace"],
  ])(
    "a hash jump lands the target below the pinned header on a %s route",
    async (_, path) => {
      const Stub = layout_stub();
      const screen = await render(
        <Stub initialEntries={[path]} future={{ v8_middleware: true }} />
      );
      await expect.element(screen.getByText("section 299")).toBeInTheDocument();

      document.getElementById("section-150")!.scrollIntoView();

      const header = screen.container.querySelector("header") as HTMLElement;
      const target = document.getElementById("section-150")!;
      expect(target.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        header.getBoundingClientRect().bottom
      );
    }
  );

  test("scroll-padding equals the header's measured height", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );
    await expect.element(screen.getByText("section 299")).toBeInTheDocument();

    const header = screen.container.querySelector("header") as HTMLElement;
    expect(getComputedStyle(document.documentElement).scrollPaddingTop).toBe(
      `${header.getBoundingClientRect().height}px`
    );
  });
});

describe("PublicLayout skip link", () => {
  test("is the first tab stop, and following it puts focus on the content", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );
    await expect.element(screen.getByText("section 299")).toBeInTheDocument();

    const skip = screen.getByRole("link", { name: "Skip to content" });
    await userEvent.tab();
    await expect.element(skip).toHaveFocus();
    await expect.element(skip).toBeVisible();

    await userEvent.keyboard("{Enter}");

    const target = document.activeElement as HTMLElement;
    expect(target.id).toBe("main");
    expect(target.contains(screen.getByText("section 0").element())).toBe(true);
  });
});

describe("PublicLayout mobile menu", () => {
  test("everything outside the header is inert while it is open, and nothing after it closes", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );
    await expect.element(screen.getByText("section 0")).toBeInTheDocument();

    const outside = () => [
      screen.getByRole("link", { name: "Skip to content" }).element(),
      screen.getByRole("link", { name: /find out more/i }).element(),
      screen.getByText("section 0").element(),
      screen.getByRole("contentinfo").element(),
    ];
    expect(outside().map(inert_of)).toEqual([false, false, false, false]);

    const toggle = screen.getByRole("button", { name: /navigation menu/i });
    await toggle.click();
    expect(outside().map(inert_of)).toEqual([true, true, true, true]);
    // the header itself stays live: the toggle and the menu are reachable
    expect(inert_of(toggle.element())).toBe(false);

    await userEvent.keyboard("{Escape}");
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    expect(outside().map(inert_of)).toEqual([false, false, false, false]);
  });

  test("a navigation closes it, so the page it lands on is not left inert", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );
    await screen.getByRole("button", { name: /navigation menu/i }).click();

    // a navigation no menu link started (back, in effect): the footer's link
    // is inert to a person, so a scripted click stands in, and only the
    // layout's path-keyed state can close the menu
    (
      screen
        .getByRole("contentinfo")
        .getByRole("link", { name: /^marketplace$/i })
        .element() as HTMLElement
    ).click();

    // minimal chrome: its header has no menu toggle
    await expect
      .element(screen.getByRole("button", { name: /navigation menu/i }))
      .not.toBeInTheDocument();
    expect(inert_of(screen.getByText("section 0").element())).toBe(false);
  });
});
