import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import {
  BANNER,
  donates,
  header_donate,
  pinned_to_bottom,
  scroll_past_hero_donate,
} from "#/__tests__/fixtures/layout-dom";
import {
  above_fold,
  EIN,
  fundraiser,
  give,
  in_view,
  LONG_NAME,
  many,
  npo,
  org_layout,
  program,
  story,
  TAGLINE_MAX,
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

/** a paragraph whose words `link` are a link to `href` */
const linked = (key: string, link: string, href: string) => ({
  _type: "block",
  _key: key,
  style: "normal",
  markDefs: [{ _type: "link", _key: `${key}-l`, href }],
  children: [
    { _type: "span", _key: `${key}-a`, text: "Read ", marks: [] },
    { _type: "span", _key: `${key}-b`, text: link, marks: [`${key}-l`] },
    { _type: "span", _key: `${key}-c`, text: `. ${PARA}`, marks: [] },
  ],
});

/** a story past the clamp with a link in its first and in its last paragraph */
const linked_story = () =>
  JSON.stringify([
    linked("first", "our first report", "https://example.org/first"),
    ...JSON.parse(story_of(STORY_CLAMP + 400)),
    linked("last", "the annual report", "https://example.org/annual"),
  ]);

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
  test("no middle dot anywhere in the rendered page", async () => {
    await page.viewport(1440, 900);
    const screen = await mount();
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
      const screen = await mount();
      const donates = screen.getByRole("link", { name: "Donate", exact: true });
      await expect.element(donates.first()).toBeInTheDocument();
      await expect.poll(() => donates.elements().some(above_fold)).toBe(true);
      const credential = screen.getByText(EIN, { exact: true });
      await expect.poll(() => in_view(credential.element())).toBe(true);
      expect(credential.element().closest("li")).toHaveTextContent(
        `EIN ${EIN}`
      );
    }
  );

  test.each([
    [1440, 900],
    [375, 812],
  ])(
    "the tallest hero (a long name, the tagline at its limit, a banner) keeps Donate in the first screen at %i",
    async (w, h) => {
      await page.viewport(w, h);
      const screen = await mount({
        npo: npo({
          name: LONG_NAME,
          tagline: TAGLINE_MAX,
          image: BANNER,
          overview_pt: story_of(STORY_CLAMP + 400),
        }),
      });
      const donates = screen.getByRole("link", { name: "Donate", exact: true });
      await expect.element(donates.first()).toBeInTheDocument();
      await expect.poll(() => donates.elements().some(above_fold)).toBe(true);
      await expect
        .poll(() => in_view(screen.getByText(EIN, { exact: true }).element()))
        .toBe(true);
    }
  );

  test("no registration, no line", async () => {
    const screen = await mount({ credential: null });
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(screen.getByText(EIN).query()).toBeNull();
  });

  test.each([
    [1440, 900],
    [375, 812],
  ])(
    "a story past the clamp fades out, its hidden links out of reach, and opens in place at %i wide",
    async (width, height) => {
      await page.viewport(width, height);
      const screen = await mount({ npo: npo({ overview_pt: linked_story() }) });
      const more = screen.getByRole("button", { name: "Read the full story" });
      await expect.element(more).toHaveAttribute("aria-expanded", "false");
      const body = document.getElementById(
        more.element().getAttribute("aria-controls") as string
      ) as HTMLElement;
      const box = body.getBoundingClientRect();
      expect(body.scrollHeight).toBeGreaterThan(box.height);

      // the cut fades into the ground, and the button follows it with no gap
      const fade = body.querySelector<HTMLElement>(":scope > [aria-hidden]");
      expect(fade).not.toBeNull();
      const faded = (fade as HTMLElement).getBoundingClientRect();
      expect(faded.bottom).toBeCloseTo(box.bottom, 0);
      expect(faded.height).toBeGreaterThan(0);
      expect(getComputedStyle(fade as HTMLElement).backgroundImage).toMatch(
        /gradient/
      );
      expect(more.element().getBoundingClientRect().top).toBeCloseTo(
        box.bottom,
        0
      );
      // the cut lands on a whole line of the paragraph it falls in
      const paras = Array.from(body.querySelectorAll("p")).filter((p) => {
        const r = p.getBoundingClientRect();
        return r.height > 0 && r.top < box.bottom;
      });
      const cut_in = paras[paras.length - 1];
      const line = Number.parseFloat(getComputedStyle(cut_in).lineHeight);
      const lines = (box.bottom - cut_in.getBoundingClientRect().top) / line;
      expect(lines).toBeGreaterThanOrEqual(1);
      expect(Math.abs(lines - Math.round(lines))).toBeLessThan(0.05);

      // the link in view takes focus; the one cut off does not until opened
      const first = screen
        .getByRole("link", { name: "our first report" })
        .element() as HTMLElement;
      const last = body.querySelector<HTMLElement>(
        'a[href="https://example.org/annual"]'
      ) as HTMLElement;
      await vi.waitFor(() => expect(last.inert).toBe(true));
      first.focus();
      expect(document.activeElement).toBe(first);
      last.focus();
      expect(document.activeElement).not.toBe(last);

      await more.click();
      await expect
        .element(screen.getByRole("button", { name: "Show less" }))
        .toHaveAttribute("aria-expanded", "true");
      expect(body.getBoundingClientRect().height).toBeGreaterThan(box.height);
      expect(body.querySelector(":scope > [aria-hidden]")).toBeNull();
      await expect
        .element(screen.getByRole("link", { name: "the annual report" }))
        .toBeVisible();
      last.focus();
      expect(document.activeElement).toBe(last);
    }
  );

  test("the give panel beside the story is at least 19rem wide, its figures past 2rem, and sticks", async () => {
    await page.viewport(1440, 900);
    const screen = await mount();
    const panel = screen.getByRole("complementary", {
      name: `Give to ${npo().name}`,
    });
    await expect.element(panel).toBeVisible();
    const el = panel.element() as HTMLElement;
    const rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    expect(el.getBoundingClientRect().width).toBeGreaterThanOrEqual(19 * rem);
    expect(getComputedStyle(el).position).toBe("sticky");
    const figure = el.querySelector("strong") as HTMLElement;
    expect(
      Number.parseFloat(getComputedStyle(figure).fontSize)
    ).toBeGreaterThan(2 * rem);
  });

  test("the hero leads with the org's mark, ringed over the banner", async () => {
    await page.viewport(1440, 900);
    const screen = await mount();
    const name = screen.getByRole("heading", { level: 1 });
    await expect.element(name).toBeVisible();
    const hero = (name.element() as HTMLElement).closest(
      ".page"
    ) as HTMLElement;
    const mark = hero.querySelector<HTMLElement>("[data-monogram]");
    // no logo in the fixture: the name's first letter
    expect(mark).toHaveTextContent("R");
    const box = (mark as HTMLElement).getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.bottom).toBeLessThanOrEqual(
      name.element().getBoundingClientRect().top
    );
    expect(getComputedStyle(mark as HTMLElement).borderTopWidth).not.toBe(
      "0px"
    );
    // it rises out of the band into the banner above
    const band = (hero.parentElement as HTMLElement).getBoundingClientRect();
    expect(box.top).toBeLessThan(band.top);
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
      [many(fundraiser, 2), "Supporter campaigns"],
      [[give(1), fundraiser(1)], "Campaigns"],
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

  test.each([
    [4, "the swipe row"],
    [2, "the grid"],
  ])(
    "a failed give list that loaded %i keeps them in %s, with its line under them",
    async (n) => {
      await page.viewport(1440, 900);
      const screen = await mount({
        give: many(give, n),
        failed: { give: true, programs: false, videos: false },
      });
      const line = screen.getByText(
        "We couldn't load this nonprofit's campaigns right now. Please try again later."
      );
      await expect.element(line).toBeVisible();
      const card = screen.getByRole("link", { name: "Clean water 1" });
      await expect.element(card).toBeVisible();
      expect(
        card.element().compareDocumentPosition(line.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      // the line sits in the campaigns' anchored section
      expect(line.element().closest("#campaigns")).not.toBeNull();
    }
  );

  test("on a phone the header's Donate waits until the hero's has scrolled away", async () => {
    await page.viewport(375, 812);
    const screen = await mount();
    const root = screen.container;
    const main = root.querySelector("main") as HTMLElement;
    await expect
      .poll(() => donates(main).some((d) => d.checkVisibility() && in_view(d)))
      .toBe(true);
    expect(header_donate(root)).toBeUndefined();
    scroll_past_hero_donate(root);
    await expect.poll(() => header_donate(root)).toBeDefined();
    await expect.poll(() => in_view(header_donate(root))).toBe(true);
  });

  test.each([
    [375, 812],
    [1440, 900],
  ])("nothing is pinned to the screen's bottom edge at %i", async (w, h) => {
    await page.viewport(w, h);
    const screen = await mount();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(pinned_to_bottom(screen.container)).toEqual([]);
  });
});
