import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import {
  EIN,
  fundraiser,
  give,
  in_view,
  many,
  npo,
  org_layout,
  program,
  story,
  video,
} from "#/__tests__/fixtures/org-layout";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { STORY_CLAMP } from "@/org-shape";
import { Feature } from "./feature";
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

const PARA =
  "We run evening classes in libraries and church halls across the county, where volunteer tutors meet adult learners one to one, week after week, until they can read a bus timetable, a medicine label or a bedtime story. ";

/** paragraphs enough to pass `chars` characters */
const story_of = (chars: number) =>
  story(...many(() => PARA, Math.ceil(chars / PARA.length)));

function mount(o: Partial<IOrgLayout> = {}) {
  const props = org_layout({
    npo: npo({ overview_pt: story_of(STORY_CLAMP + 400) }),
    give: many(give, 4),
    programs: many(program, 2),
    ...o,
  });
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Feature {...props} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("Feature", () => {
  test.each([
    [1440, 900],
    [375, 812],
  ])(
    "Donate and the registration are in view on first load at %i wide",
    async (width, height) => {
      await page.viewport(width, height);
      const screen = await mount();
      const donates = screen.getByRole("link", { name: "Donate", exact: true });
      await expect.element(donates.first()).toBeInTheDocument();
      await expect.poll(() => donates.elements().some(in_view)).toBe(true);
      const credential = screen.getByText(EIN, { exact: true });
      await expect.poll(() => in_view(credential.element())).toBe(true);
      expect(credential.element().closest("p")).toHaveTextContent(`EIN ${EIN}`);
    }
  );

  test("no registration, no line", async () => {
    const screen = await mount({ credential: null });
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(screen.getByText(EIN).query()).toBeNull();
  });

  test("a story past the clamp is cut short and opens in place", async () => {
    await page.viewport(1440, 900);
    const screen = await mount();
    const more = screen.getByRole("button", { name: "Read the full story" });
    await expect.element(more).toHaveAttribute("aria-expanded", "false");
    const body = document.getElementById(
      more.element().getAttribute("aria-controls") as string
    ) as HTMLElement;
    const cut = body.getBoundingClientRect().height;
    expect(body.scrollHeight).toBeGreaterThan(cut);

    await more.click();
    await expect
      .element(screen.getByRole("button", { name: "Show less" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(body.getBoundingClientRect().height).toBeGreaterThan(cut);
  });

  test("a story under the clamp shows whole, with no button", async () => {
    const screen = await mount({
      npo: npo({ overview_pt: story_of(STORY_CLAMP - PARA.length) }),
    });
    await expect
      .element(screen.getByRole("heading", { name: "Our story" }))
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "Read the full story" }).query()
    ).toBeNull();
  });

  test("4+ campaigns swipe in a row; two sit side by side as halves", async () => {
    await page.viewport(1440, 900);
    const four = await mount();
    // the row is its own keyboard-reachable scroller
    const row = four.getByRole("region", { name: "Campaigns" }).element();
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(getComputedStyle(row).overflowX).toBe("auto");
    await expect
      .element(four.getByRole("button", { name: "See all 4" }))
      .toBeVisible();
    await cleanup();

    const two = await mount({ give: many(give, 2) });
    const cards = [1, 2].map(
      (n) =>
        two
          .getByRole("link", { name: `Clean water ${n}` })
          .element()
          .closest("article") as HTMLElement
    );
    await expect.element(two.getByText("Clean water 2")).toBeVisible();
    const [a, b] = cards.map((c) => c.getBoundingClientRect());
    expect(a.top).toBe(b.top);
    expect(b.left).toBeGreaterThan(a.right);
    expect(two.getByRole("button", { name: /^See all/ }).query()).toBeNull();
  });

  test("programs stay full-width rows at any count", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ programs: many(program, 5) });
    await expect
      .element(screen.getByRole("link", { name: "School meals 5" }))
      .toBeVisible();
    const rows = many(
      (n) =>
        screen
          .getByRole("link", { name: `School meals ${n}` })
          .element()
          .closest("article") as HTMLElement,
      5
    ).map((r) => r.getBoundingClientRect());
    const list = (
      screen
        .getByRole("heading", { name: "Programs", level: 2 })
        .element()
        .closest("section") as HTMLElement
    ).getBoundingClientRect();
    for (const [i, r] of rows.entries()) {
      expect(r.width).toBe(list.width);
      if (i > 0) expect(r.top).toBeGreaterThan(rows[i - 1].bottom);
    }
  });

  test("the header links only the sections the page has", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ videos: [video(1)], programs: [] });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    await expect.element(nav).toBeVisible();
    const links = nav
      .getByRole("link")
      .elements()
      .map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Story", "#story"],
      ["Campaigns", "#campaigns"],
      ["Videos", "#videos"],
    ]);
    for (const [, href] of links) {
      expect(document.querySelector(href as string)).not.toBeNull();
    }
  });

  test("the give section and its header link are named by what the list holds", async () => {
    await page.viewport(1440, 900);
    const cases = [
      [many(fundraiser, 2), "Fundraisers"],
      [[give(1), fundraiser(1)], "Campaigns & fundraisers"],
    ] as const;
    for (const [list, name] of cases) {
      const screen = await mount({ give: [...list] });
      await expect
        .element(screen.getByRole("heading", { name, level: 2, exact: true }))
        .toBeVisible();
      const link = screen
        .getByRole("navigation", { name: "Sections" })
        .getByRole("link", { name, exact: true });
      await expect.element(link).toHaveAttribute("href", "#campaigns");
      await cleanup();
    }
  });

  test("a list that failed keeps its section and link, with the failure line", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({
      failed: { give: false, programs: false, videos: true },
    });
    await expect
      .element(
        screen
          .getByRole("navigation", { name: "Sections" })
          .getByRole("link", { name: "Videos" })
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "We couldn't load this nonprofit's videos right now. Please try again later."
        )
      )
      .toBeInTheDocument();
  });
});
