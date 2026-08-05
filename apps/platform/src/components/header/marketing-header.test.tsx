import { createRoutesStub } from "react-router";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
// the scrim's geometry is the thing under test, so the real stylesheet has to
// be loaded — the assertions read computed position and boxes, not classnames.
import "#/index.css";
import { AnnouncementBanner } from "#/components/chrome/announcement-banner";
import { MarketingHeader } from "./marketing-header";

// under the `min-[75rem]` breakpoint, where the burger and its overlay exist.
const NARROW = { w: 390, h: 844 };
// vitest browser mode's own default — restored so a later file in the run
// (fileParallelism is off) doesn't inherit this one's viewport.
const DEFAULT = { w: 414, h: 896 };

// PublicLayout's shell, with the announcement banner in the track above the
// header: that extra row is what pushes the header down at scroll-top and made
// a header-anchored overlay overshoot the fold by that much more.
function Page() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_4rem_minmax(calc(100dvh-4rem),1fr)_auto]">
      <AnnouncementBanner />
      <MarketingHeader classes="sticky z-40 -top-px" />
      <main />
      <footer />
    </div>
  );
}

function stub() {
  return createRoutesStub([
    { path: "/", Component: Page, HydrateFallback: () => null },
    { path: "/product", Component: () => <p>product page</p> },
  ]);
}

async function open_menu() {
  const screen = await render(
    <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
  );
  const toggle = screen.getByRole("button", {
    name: "Navigation menu",
    exact: true,
  });
  await expect.element(toggle).toBeVisible();
  return { screen, toggle };
}

const Stub = stub();

beforeEach(async () => {
  // a dismissed banner collapses to 0px and the scenario stops being the one
  // under test — the header would sit at the top of the document.
  localStorage.removeItem("banner:ncnp-endorsement");
  document.documentElement.removeAttribute("data-banner-dismissed");
  await page.viewport(NARROW.w, NARROW.h);
});

afterAll(async () => {
  await page.viewport(DEFAULT.w, DEFAULT.h);
});

describe("MarketingHeader mobile menu", () => {
  test("opening the menu adds no scrollable height to the document", async () => {
    const { screen, toggle } = await open_menu();

    const before = document.documentElement.scrollHeight;
    await toggle.click();
    await expect
      .element(screen.getByRole("button", { name: "Close navigation menu" }))
      .toBeVisible();

    // the regression this pins: an `absolute top-full h-dvh` scrim starts at
    // the header's bottom edge — banner height + header height down the page —
    // and still runs a full viewport tall, so it extended the scrollable area
    // past the footer by exactly that offset. a fixed box contributes nothing.
    expect(document.documentElement.scrollHeight).toBe(before);
  });

  test("the scrim covers the viewport rather than hanging off the header", async () => {
    const { screen, toggle } = await open_menu();
    await toggle.click();

    const scrim = screen
      .getByRole("button", { name: "Close navigation menu" })
      .element();

    expect(getComputedStyle(scrim).position).toBe("fixed");
    const box = scrim.getBoundingClientRect();
    expect(Math.round(box.top)).toBe(0);
    expect(Math.round(box.bottom)).toBe(window.innerHeight);
  });

  test("the header bar stays above the scrim", async () => {
    const { screen, toggle } = await open_menu();
    await toggle.click();

    // the scrim spans the whole viewport now, so the bar only stays operable
    // because it's painted over it. hit-testing the toggle is what proves it —
    // a bar that fell behind the scrim would surface the scrim here, and the
    // menu could never be closed from the burger.
    const el = screen
      .getByRole("button", { name: "Navigation menu", exact: true })
      .element();
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      b.left + b.width / 2,
      b.top + b.height / 2
    );
    expect(hit?.closest("button")).toBe(el);

    await toggle.click();
    await expect
      .element(screen.getByRole("button", { name: "Close navigation menu" }))
      .not.toBeInTheDocument();
  });

  test("clicking the scrim closes the menu", async () => {
    const { screen, toggle } = await open_menu();
    await toggle.click();

    // the scrim's box is the whole viewport now, so its centre sits under the
    // menu panel — click low instead, in the bare area below the panel that is
    // the only part a user could ever hit.
    await screen
      .getByRole("button", { name: "Close navigation menu" })
      .click({ position: { x: 20, y: NARROW.h - 40 } });

    await expect
      .element(screen.getByRole("link", { name: "Fund Management" }))
      .not.toBeInTheDocument();
  });
});
