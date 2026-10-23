import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { BANNER } from "#/__tests__/fixtures/layout-dom";
import {
  EIN,
  fundraiser,
  give,
  in_view,
  many,
  message,
  npo,
  org_layout,
  program,
  video,
} from "#/__tests__/fixtures/org-layout";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { Hub } from "./hub";
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

function mount(props: IOrgLayout) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Hub {...props} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

const tab_names = () =>
  [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent);

describe("Hub", () => {
  test("no middle dot anywhere in the rendered page", async () => {
    await page.viewport(1440, 900);
    const screen = await mount(
      org_layout({ give: many(give, 4), messages: [message(1)] })
    );
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
    "Donate and the registration are in view on first load at %i wide",
    async (width, height) => {
      await page.viewport(width, height);
      const screen = await mount(
        org_layout({ give: many(give, 4), programs: many(program, 2) })
      );
      const donates = screen.getByRole("link", { name: "Donate", exact: true });
      await expect.element(donates.first()).toBeInTheDocument();
      await expect.poll(() => donates.elements().some(in_view)).toBe(true);
      const credential = screen.getByText(EIN, { exact: true });
      await expect.poll(() => in_view(credential.element())).toBe(true);
      expect(credential.element().closest("li")).toHaveTextContent(
        `EIN ${EIN}`
      );
    }
  );

  test("a lone featured video plays at the reading measure, on the heading's edge", async () => {
    await page.viewport(1440, 900);
    const screen = await mount(
      org_layout({ give: many(give, 4), videos: [video(1)] })
    );
    const featured = screen.getByRole("region", { name: "Featured" });
    const frame = featured.getByTitle("Field visit 1");
    await expect.element(frame).toBeInTheDocument();
    // max-w-3xl, 48rem
    const measure =
      48 *
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const width = frame.element().getBoundingClientRect().width;
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(measure);
    const region = (featured.element() as HTMLElement).getBoundingClientRect();
    expect(width).toBeLessThan(region.width);
    const box = frame.element().getBoundingClientRect();
    const heading = featured
      .getByRole("heading", { name: "Featured" })
      .element()
      .getBoundingClientRect();
    expect(box.left).toBeCloseTo(heading.left, 0);
  });

  test("the name clears the banner", async () => {
    await page.viewport(1440, 900);
    const screen = await mount(
      org_layout({ give: many(give, 4), npo: npo({ image: BANNER }) })
    );
    const h1 = screen.getByRole("heading", { level: 1 }).element();
    const banner = screen.container.querySelector("main img") as HTMLElement;
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(h1.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      banner.getBoundingClientRect().bottom + 16
    );
  });

  test("no registration, no line", async () => {
    const screen = await mount(
      org_layout({ give: many(give, 4), credential: null })
    );
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(screen.getByText(EIN).query()).toBeNull();
  });

  test("a tab per kind with items, most first, a lone item as Featured, and Messages last", async () => {
    await page.viewport(375, 812);
    const screen = await mount(
      org_layout({
        give: many(give, 2),
        programs: many(program, 5),
        videos: [video(1)],
        messages: many(message, 3),
        on_more_messages: vi.fn(),
      })
    );
    await expect.element(screen.getByRole("tablist")).toBeVisible();
    // the lone video gets no tab; messages never lead, however many, and
    // carry no count: they load a page at a time
    expect(tab_names()).toEqual(["Programs 5", "Campaigns 2", "Messages"]);
    const featured = screen.getByRole("region", { name: "Featured" });
    await expect
      .element(featured.getByTitle("Field visit 1"))
      .toBeInTheDocument();

    // the most-stocked kind is open first
    await expect
      .element(screen.getByRole("tab", { name: "Programs 5" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("link", { name: "School meals 1" }))
      .toBeVisible();

    await screen.getByRole("tab", { name: "Campaigns 2" }).click();
    await expect
      .element(screen.getByRole("link", { name: "Clean water 2" }))
      .toBeVisible();
    await screen.getByRole("tab", { name: /^Messages/ }).click();
    await expect
      .element(screen.getByText("Keep up the good work, from donor 1."))
      .toBeVisible();

    // the tab row scrolls inside itself; the page never scrolls sideways
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
  });

  test("the give tab is named by what it holds", async () => {
    const cases = [
      [many(give, 3), "Campaigns 3"],
      [many(fundraiser, 3), "Supporter campaigns 3"],
      [[give(1), ...many(fundraiser, 2)], "Campaigns 3"],
    ] as const;
    for (const [list, name] of cases) {
      const screen = await mount(
        org_layout({ give: [...list], programs: many(program, 2) })
      );
      await expect.element(screen.getByRole("tablist")).toBeVisible();
      expect(tab_names()).toEqual([name, "Programs 2"]);
      await cleanup();
    }

    // a lone kind's heading takes the same name
    const lone = await mount(org_layout({ give: many(fundraiser, 4) }));
    await expect
      .element(
        lone.getByRole("heading", { name: "Supporter campaigns", level: 2 })
      )
      .toBeVisible();
  });

  test("the tagline sits under the name with the short story after it, links kept; without one, the story alone, whole", async () => {
    await page.viewport(375, 812);
    const before =
      "Riverside Literacy puts a trained reading tutor beside every adult learner who asks, in libraries across three counties. Read ";
    const story_pt = JSON.stringify([
      {
        _type: "block",
        _key: "b0",
        style: "normal",
        markDefs: [
          {
            _type: "link",
            _key: "l0",
            href: "https://riverside.example.org/method",
          },
        ],
        children: [
          { _type: "span", _key: "s0", text: before, marks: [] },
          { _type: "span", _key: "s1", text: "how we teach", marks: ["l0"] },
          { _type: "span", _key: "s2", text: ".", marks: [] },
        ],
      },
    ]);
    const with_story = (tagline: string | null) =>
      mount(
        org_layout({
          give: many(give, 4),
          npo: npo({ tagline, overview_pt: story_pt }),
        })
      );
    const follows = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    const tagged = await with_story("Every adult a reader.");
    const h1 = tagged.getByRole("heading", { level: 1 }).element();
    const tagline = tagged
      .getByText("Every adult a reader.", { exact: true })
      .element();
    const link = tagged.getByRole("link", { name: "how we teach" });
    await expect.element(link).toBeVisible();
    await expect
      .element(link)
      .toHaveAttribute("href", "https://riverside.example.org/method");
    expect(follows(h1, tagline)).toBe(true);
    expect(follows(tagline, link.element())).toBe(true);
    await cleanup();

    const untagged = await with_story(null);
    const story_link = untagged.getByRole("link", { name: "how we teach" });
    await expect.element(story_link).toBeVisible();
    // whole: the paragraph shows past two lines and hides nothing
    const para = (story_link.element() as HTMLElement).closest(
      "p"
    ) as HTMLElement;
    const s = getComputedStyle(para);
    expect(s.webkitLineClamp).toBe("none");
    expect(para.clientHeight / Number.parseFloat(s.lineHeight)).toBeGreaterThan(
      2
    );
    expect(para.scrollHeight - para.clientHeight).toBeLessThanOrEqual(1);
  });

  test("one kind left has no tablist, just its grid under its heading", async () => {
    const screen = await mount(org_layout({ give: many(give, 6) }));
    await expect
      .element(screen.getByRole("heading", { name: "Campaigns", level: 2 }))
      .toBeVisible();
    expect(screen.getByRole("tablist").query()).toBeNull();
    await expect
      .element(screen.getByRole("link", { name: "Clean water 1" }))
      .toBeVisible();
  });

  test("a list that failed keeps its tab, which shows the failure line", async () => {
    const screen = await mount(
      org_layout({
        give: many(give, 5),
        failed: { give: false, programs: true, videos: false },
      })
    );
    expect(tab_names()).toEqual(["Campaigns 5", "Programs"]);
    await screen.getByRole("tab", { name: "Programs" }).click();
    await expect
      .element(
        screen.getByText(
          "We couldn't load this nonprofit's programs right now. Please try again later."
        )
      )
      .toBeVisible();
  });
});
