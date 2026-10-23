import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { BANNER } from "#/__tests__/fixtures/layout-dom";
import {
  give,
  many,
  npo,
  org_layout,
  program,
} from "#/__tests__/fixtures/org-layout";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { Feature } from "./feature";
import { Hub } from "./hub";
import { Letter } from "./letter";
import { Poster } from "./poster";
import type { IOrgLayout } from "./types";

// the viewer the header's favorite button reads; null is signed out
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: null, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  window.scrollTo(0, 0);
  await reset_viewport();
});

const LAYOUTS: [string, ComponentType<IOrgLayout>][] = [
  ["Poster", Poster],
  ["Letter", Letter],
  ["Hub", Hub],
  ["Feature", Feature],
];

const SIZES = [
  [1440, 900],
  [375, 812],
] as const;

function mount(Layout: ComponentType<IOrgLayout>) {
  const props = org_layout({
    npo: npo({ image: BANNER, logo: BANNER }),
    give: many(give, 4),
    programs: many(program, 2),
  });
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Layout {...props} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

/** the left edge of the first thing drawn on `root`'s first page shape */
function content_left(root: Element): number {
  const shape = root.querySelector(".page") as HTMLElement;
  const first = shape.firstElementChild as HTMLElement;
  return first.getBoundingClientRect().left;
}

/** the page shape's content box: inside its gutter */
function gutter_edges(shape: Element): { left: number; right: number } {
  const r = shape.getBoundingClientRect();
  const s = getComputedStyle(shape);
  return {
    left: r.left + Number.parseFloat(s.paddingLeft),
    right: r.right - Number.parseFloat(s.paddingRight),
  };
}

describe("one page edge", () => {
  for (const [name, Layout] of LAYOUTS) {
    test.each(SIZES)(
      `${name}: header, the first section and footer start on one edge at %i`,
      async (w, h) => {
        await page.viewport(w, h);
        const screen = await mount(Layout);
        await expect
          .element(screen.getByRole("heading", { level: 1 }))
          .toBeVisible();
        const c = screen.container;
        const header = content_left(c.querySelector("header") as Element);
        const main = content_left(c.querySelector("main") as Element);
        const footer = content_left(c.querySelector("footer") as Element);
        expect(Math.abs(main - header)).toBeLessThanOrEqual(1);
        expect(Math.abs(footer - header)).toBeLessThanOrEqual(1);
      }
    );
  }

  test.each(SIZES)(
    "Letter: the banner spans the page between the header's gutters at %i",
    async (w, h) => {
      await page.viewport(w, h);
      const screen = await mount(Letter);
      const banner = screen.container.querySelector(
        "article figure img"
      ) as HTMLElement;
      await expect
        .poll(() => banner.getBoundingClientRect().width)
        .toBeGreaterThan(0);
      const edges = gutter_edges(
        screen.container.querySelector("header .page") as Element
      );
      const r = banner.getBoundingClientRect();
      expect(Math.abs(r.left - edges.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.right - edges.right)).toBeLessThanOrEqual(1);
    }
  );
});
