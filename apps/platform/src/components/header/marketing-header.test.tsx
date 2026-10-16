import { useState } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
// the scrim's height is a tailwind arbitrary value, so the real stylesheet has
// to be loaded for the measurement below to mean anything.
import "#/index.css";
import { MarketingHeader } from "./marketing-header";

// the menu state is the layout's; this holds it the way PublicLayout does.
function Header() {
  const [open, set_open] = useState(false);
  return (
    <MarketingHeader
      classes="sticky z-sticky -top-px"
      menu_open={open}
      on_menu_open_change={set_open}
    />
  );
}

// the header as the layouts mount it: sticky, in a grid whose first track is
// the declared 4rem header row.
function stub() {
  return createRoutesStub([
    {
      path: "/",
      Component: () => (
        <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[4rem_1fr] min-h-dvh">
          <Header />
          <main />
        </div>
      ),
      HydrateFallback: () => null,
    },
  ]);
}

async function open_menu() {
  const Stub = stub();
  const screen = await render(
    <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
  );
  const toggle = screen.getByRole("button", { name: /navigation menu/i });
  await toggle.click();
  const header = screen.container.querySelector("header");
  if (!header) throw new Error("header not found");
  return { screen, toggle, header };
}

afterEach(async () => {
  await page.viewport(414, 896);
});

describe("mobile menu scrim", () => {
  test("is a viewport minus the header, so it ends at the fold instead of overhanging", async () => {
    const { header } = await open_menu();

    const scrim = header.querySelector(':scope > [aria-hidden="true"]');
    if (!scrim) throw new Error("scrim not found");

    const header_h = header.getBoundingClientRect().height;
    // the scrim hangs off the header's bottom edge (`top-full`), so a flat
    // `h-dvh` puts its bottom a header height past the fold. subtracting the
    // containing block keeps that overhang out of the document's scrollable
    // area.
    const overhang =
      scrim.getBoundingClientRect().height - (window.innerHeight - header_h);
    // 1px of slack for the subpixel header box (its bottom border). the
    // regression this pins is a whole header height (64px), not a rounding step.
    expect(Math.abs(overhang)).toBeLessThanOrEqual(1);
  });

  test("is no tab stop: the keyboard goes from the toggle into the menu", async () => {
    const { screen, toggle } = await open_menu();

    await expect
      .element(screen.getByRole("button", { name: /close navigation menu/i }))
      .not.toBeInTheDocument();
    // open moved focus to the first link; one shift-tab back is the toggle
    await expect
      .element(screen.getByRole("link", { name: "Donation Processing" }))
      .toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(toggle).toHaveFocus();
  });
});

describe("mobile menu", () => {
  test("escape closes it and hands focus back to the toggle", async () => {
    const { screen, toggle } = await open_menu();
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.element(toggle).toHaveFocus();
    await expect
      .element(screen.getByRole("link", { name: "Log In" }))
      .not.toBeInTheDocument();
  });

  test.each([
    [844, 390],
    [720, 450],
    [320, 256],
  ])(
    "scrolls inside itself at %ix%i, so its last item can be reached",
    async (w, h) => {
      await page.viewport(w, h);
      const { screen } = await open_menu();

      const login = screen.getByRole("link", { name: "Log In" }).element();
      const panel = login.closest<HTMLElement>("[id]");
      if (!panel) throw new Error("menu panel not found");

      // capped at the fold: the panel's own box never runs past the viewport
      expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.innerHeight + 1
      );
      expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);

      // and focusing the last item scrolls the panel, not the page, to it
      (login as HTMLElement).focus();
      const box = login.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    }
  );
});
