import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import {
  BANNER,
  donates,
  pinned_at_end,
} from "#/__tests__/fixtures/layout-dom";
import {
  EIN,
  give,
  in_view,
  message,
  npo,
  org_layout,
  program,
  story,
} from "#/__tests__/fixtures/org-layout";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import type { INpoPublic } from "$/pg/queries/npo";
import { OrgPageFrame } from "./org-page-frame";
import { Poster } from "./poster";
import type { IOrgLayout } from "./types";

// the viewer the header's favorite button reads; null is signed out
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: null, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  await reset_viewport();
  window.scrollTo(0, 0);
});

const DETAILS = {
  registration_number: EIN,
  address: "3131 Olympic Blvd, Santa Monica CA 90404",
  active_in: "United States",
};

const STORY_AT_MAX =
  "Riverside Literacy puts a trained reading tutor beside every adult learner who asks for one, twice a week, in libraries and church halls across three counties. Last year 212 adults read their first full book with us, and most of them came back the next year to tutor the newcomers who followed them in.";

/** a short-story org with a banner that loads offline, unless told otherwise */
function mount(o: Partial<IOrgLayout> = {}, n: Partial<INpoPublic> = {}) {
  const props = org_layout({ ...o, npo: npo({ image: BANNER, ...n }) });
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Poster {...props} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("Poster", () => {
  test("no middle dot anywhere in the rendered page", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({
      give: [give(1)],
      messages: [message(1), message(2)],
    });
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(screen.container.textContent).not.toContain("·");
    // the registration is the meta row's last item
    const row = screen.getByText(EIN, { exact: true }).element().closest("ul");
    expect(row?.lastElementChild).toHaveTextContent(`EIN ${EIN}`);
  });

  test.each([
    [1440, 900],
    [375, 812],
  ])(
    "Donate and the registration are in view on first load at %i",
    async (w, h) => {
      await page.viewport(w, h);
      // a story at the short ceiling, the tallest hero Poster gets
      const screen = await mount({}, { overview_pt: story(STORY_AT_MAX) });
      const main = screen.container.querySelector("main") as HTMLElement;
      const [hero_donate] = donates(main);
      await expect.poll(() => in_view(hero_donate)).toBe(true);
      const credential = screen.getByText(EIN, { exact: true });
      await expect.poll(() => in_view(credential.element())).toBe(true);
      expect(credential.element().closest("li")).toHaveTextContent(
        `EIN ${EIN}`
      );
    }
  );

  test("the tagline is the deck under the name, and the short story follows as the lead", async () => {
    const screen = await mount(
      {},
      { tagline: "Every adult a reader.", overview_pt: story(STORY_AT_MAX) }
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    const deck = screen.getByText("Every adult a reader.", { exact: true });
    const lead = screen.getByText(STORY_AT_MAX, { exact: true });
    await expect.element(deck).toBeVisible();
    await expect.element(lead).toBeVisible();
    const follows = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(h1.element(), deck.element())).toBe(true);
    expect(follows(deck.element(), lead.element())).toBe(true);
  });

  test("no registration, no line", async () => {
    const screen = await mount({ credential: null });
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(screen.getByText(EIN).query()).toBeNull();
  });

  test("no items leaves Ways to help out; one is a lone feature card with no navigation", async () => {
    await page.viewport(1440, 900);
    const none = await mount();
    await expect.element(none.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      none.getByRole("heading", { name: "Ways to help" }).query()
    ).toBeNull();
    await cleanup();

    const one = await mount({ give: [give(1)] });
    const section = one.getByRole("region", { name: "Ways to help" });
    await expect.element(section).toBeVisible();
    const lists = section.element().querySelectorAll("ul");
    expect(lists).toHaveLength(1);
    expect((lists[0] as HTMLElement).dataset.count).toBe("1");
    expect(section.element().querySelector("button")).toBeNull();
    await expect
      .element(one.getByRole("heading", { level: 3, name: "Clean water 1" }))
      .toBeVisible();
  });

  test("with no banner there is no img and the deep band leads the page", async () => {
    const screen = await mount({}, { image: null });
    const h1 = screen.getByRole("heading", { level: 1 });
    await expect.element(h1).toBeVisible();
    expect(screen.container.querySelector("img")).toBeNull();
    const main = screen.container.querySelector("main") as HTMLElement;
    expect(main.firstElementChild).toHaveClass("bg-primary-deep");
    expect(main.firstElementChild).toContainElement(
      h1.element() as HTMLElement
    );
  });

  test("a banner sits over the band", async () => {
    const screen = await mount();
    const main = screen.container.querySelector("main") as HTMLElement;
    const band = main.querySelector(".bg-primary-deep") as HTMLElement;
    const banner = main.querySelector("img") as HTMLImageElement;
    expect(banner).not.toBeNull();
    expect(band.contains(banner)).toBe(false);
    expect(
      banner.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test("a failed list shows its line in place of its items, and the others still render", async () => {
    const screen = await mount({
      give: [give(1)],
      programs: [program(1)],
      failed: { give: false, programs: true, videos: false },
    });
    await expect
      .element(
        screen.getByText(
          "We couldn't load this nonprofit's programs right now. Please try again later."
        )
      )
      .toBeVisible();
    await expect.element(screen.getByText("Clean water 1")).toBeVisible();
    expect(screen.getByText("School meals 1").query()).toBeNull();
  });

  test("messages bring the quote strip, and none leave it out", async () => {
    const screen = await mount({ messages: [message(1), message(2)] });
    const strip = screen.getByRole("region", { name: "Donor messages" });
    await expect.element(strip).toBeVisible();
    await expect
      .element(strip.getByText("Donor 1", { exact: true }))
      .toBeVisible();
    await cleanup();

    const none = await mount();
    await expect.element(none.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      none.getByRole("region", { name: "Donor messages" }).query()
    ).toBeNull();
  });

  test("a phone gets the pinned bar on its bottom edge, and the page root ends with it", async () => {
    await page.viewport(375, 812);
    const screen = await mount();
    const root = screen.container.querySelector("main")
      ?.parentElement as HTMLElement;
    const bar = root.lastElementChild as HTMLElement;
    const [bar_donate] = donates(bar);
    await expect.poll(() => in_view(bar_donate)).toBe(true);
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(
      window.innerHeight,
      0
    );
    expect(bar.textContent).toContain("$3,322 raised");
  });

  test("on a phone page taller than the screen, the bar rests under the footer's details at the end, with nothing after it", async () => {
    await page.viewport(375, 812);
    const screen = await mount(
      { footer: DETAILS },
      { overview_pt: story(STORY_AT_MAX) }
    );
    await expect
      .element(screen.getByText("Organization details"))
      .toBeVisible();
    const root = screen.container.querySelector("main")
      ?.parentElement as HTMLElement;
    expect(document.documentElement.scrollHeight).toBeGreaterThan(
      window.innerHeight
    );
    const end = pinned_at_end(root);
    expect(end.footer_bottom).toBeLessThanOrEqual(end.bar_top);
    expect(Math.abs(end.bar_bottom - end.doc_bottom)).toBeLessThanOrEqual(1);
  });

  test("on a phone page shorter than the screen, the bar sits on the bottom edge under the footer", async () => {
    await page.viewport(375, 812);
    const props = org_layout({ footer: DETAILS });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <OrgPageFrame page={props} hero_donate={null}>
            <h1>Riverside Literacy</h1>
          </OrgPageFrame>
        ),
      },
    ]);
    const screen = await render(<Stub initialEntries={["/"]} />);
    await expect
      .element(screen.getByText("Organization details"))
      .toBeVisible();
    const root = screen.container.querySelector("main")
      ?.parentElement as HTMLElement;
    const end = pinned_at_end(root);
    expect(Math.abs(end.doc_bottom - window.innerHeight)).toBeLessThanOrEqual(
      1
    );
    expect(end.footer_bottom).toBeLessThanOrEqual(end.bar_top);
    expect(Math.abs(end.bar_bottom - end.doc_bottom)).toBeLessThanOrEqual(1);
  });
});
