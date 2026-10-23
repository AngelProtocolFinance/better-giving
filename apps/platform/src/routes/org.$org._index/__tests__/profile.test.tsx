import { HttpResponse, http } from "msw";
import { act } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Locator, page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { shared_via_facebook } from "#/__tests__/fixtures/share-target";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { unsdgs } from "#/constants/unsdgs";
import { mswWorker } from "#/setup-tests-browser";
import type { IFundItem } from "@/fundraiser";
import type { INpoPublic } from "$/pg/queries/npo";
import { type IProfile, Profile } from "../profile";

// the viewer the header's favorite button reads; null is signed out
const user_mock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: user_mock.current, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  user_mock.current = null;
  await reset_viewport();
});

const npo = {
  id: 7,
  slug: "acme",
  name: "Acme Relief",
  endow_designation: "Charity",
  tagline: "Food and shelter",
  image: null,
  logo: "https://example.com/logo.png",
  hq_country: "United States",
  url: "https://acme.example",
  overview_pt: "[]",
  registration_number: "EIN123",
  street_address: null,
  active_in_countries: [],
  sdgs: [],
  social_media_urls: null,
  contributions_total: 90,
  target: undefined,
} as unknown as INpoPublic;

/** an image that loads with no network, one colour apart from the next */
const swatch = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="${fill}"/></svg>`
  )}`;
const BANNER = swatch("red");
const LOGO = swatch("blue");

const empty: IProfile = {
  npo,
  url: "https://x/org/acme",
  donors: 3,
  messages: [],
  messages_next: null,
  campaigns: [],
  funds: Promise.resolve([]),
  media: Promise.resolve([]),
  programs: Promise.resolve([]),
};

const campaign: IProfile["campaigns"][number] = {
  id: "c1",
  name: "Winter coats",
  to: "/org/acme/winter",
  image: null,
  raised: 50,
  target: "100",
  official: true,
  mark: null,
  excerpt: "Coats for every child in the shelter this winter",
  supporters: 1,
  donate_to: "/org/acme/winter",
};

const fund = (o: Partial<IFundItem>) =>
  ({
    id: "f1",
    name: "Spring Drive",
    description_pt: "[]",
    banner: null,
    logo: null,
    active: true,
    expiration: Date.now() / 1000 + 86_400,
    donation_total_usd: 20,
    target: "0",
    npo_owner: null,
    creator_name: "Maya Lin",
    ...o,
  }) as IFundItem;

function mount(props: Partial<IProfile> = {}) {
  const Stub = createRoutesStub([
    { path: "/org/:org", Component: () => <Profile {...empty} {...props} /> },
  ]);
  return render(<Stub initialEntries={["/org/acme"]} />);
}

describe("org profile", () => {
  it("leaves out every section with no items, heading included", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Acme Relief" }))
      .toBeVisible();
    // Campaigns, Programs and Media each render nothing until their deferred
    // read lands, so absence means something only once they have
    await act(async () => {
      await Promise.all([empty.funds, empty.media, empty.programs]);
    });
    for (const name of [
      "About",
      "Campaigns",
      "Programs",
      "Media",
      "Donor messages",
    ]) {
      expect(screen.getByRole("heading", { name }).query()).toBeNull();
    }
    expect(screen.getByText("Address").query()).toBeNull();
    expect(
      screen.getByRole("link", { name: "Facebook", exact: true }).query()
    ).toBeNull();
  });

  it("pins a header with the org's name, Share, Favorite and Donate, and no bottom action bar", async () => {
    await page.viewport(1280, 900);
    user_mock.current = { bookmarks: [] };
    const screen = await mount();
    const header = screen.getByRole("banner");
    await expect
      .element(header.getByRole("link", { name: "Acme Relief" }))
      .toHaveAttribute("href", "/org/acme");
    expect(getComputedStyle(header.element()).position).toBe("sticky");
    await expect
      .element(header.getByRole("button", { name: "Add to favorites" }))
      .toBeVisible();
    await expect
      .element(header.getByRole("link", { name: "Donate", exact: true }))
      .toHaveAttribute("href", "/donate/7");
    // on desktop the header's is the one Donate: the card's is display:none,
    // which takes it out of the accessibility tree
    expect(
      screen.getByRole("link", { name: "Donate", exact: true }).elements()
    ).toHaveLength(1);

    await header.getByRole("button", { name: "Share", exact: true }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Share" }))
      .toBeVisible();
    // the chooser is a modal; with it closed nothing on the page is pinned
    // to the viewport, so there is no bottom action bar
    await cleanup();
    await page.viewport(375, 667);
    const phone = await mount();
    await expect
      .element(phone.getByRole("heading", { level: 1 }))
      .toBeVisible();
    const fixed = [...document.querySelectorAll("body *")].filter(
      (el) => getComputedStyle(el).position === "fixed"
    );
    expect(fixed).toEqual([]);
  });

  it("on a phone, the header card ends on a large Donate beside the header's", async () => {
    await page.viewport(375, 667);
    const screen = await mount();
    const card_donate = screen
      .getByRole("main")
      .getByRole("link", { name: "Donate", exact: true });
    await expect.element(card_donate).toBeVisible();
    await expect.element(card_donate).toHaveAttribute("href", "/donate/7");
    await expect
      .element(
        screen
          .getByRole("banner")
          .getByRole("link", { name: "Donate", exact: true })
      )
      .toBeVisible();
    expect(
      screen.getByRole("link", { name: "Donate", exact: true }).elements()
    ).toHaveLength(2);
  });

  it("pairs raised and donors each with its figure, with no form, no FAQ and no goal bar without a target", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByRole("definition").filter({ hasText: "$90" }))
      .toBeVisible();
    expect(mast_stats()).toEqual({ raised: "$90", donors: "3" });
    expect(screen.getByRole("progressbar").query()).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getByText(/frequently asked/i).query()).toBeNull();
    expect(screen.getByText(/tax-deductible/i).query()).toBeNull();
  });

  it("names a single donor in the singular", async () => {
    const screen = await mount({ donors: 1 });
    await expect
      .element(screen.getByRole("definition").filter({ hasText: "$90" }))
      .toBeVisible();
    expect(mast_stats()).toEqual({ raised: "$90", donor: "1" });
  });

  it("shows only the raised figure when the donor count is unavailable", async () => {
    const screen = await mount({ donors: null });
    await expect
      .element(screen.getByRole("definition").filter({ hasText: "$90" }))
      .toBeVisible();
    expect(mast_stats()).toEqual({ raised: "$90" });
  });

  it("shows a goal bar with a target", async () => {
    const screen = await mount({
      npo: { ...npo, target: "300" } as INpoPublic,
    });
    await expect
      .element(screen.getByText("30% of $300 goal", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("progressbar")).toBeVisible();
  });

  it("shows none of the org's goals, and still its About", async () => {
    const screen = await mount({
      npo: {
        ...npo,
        sdgs: [1, 4],
        overview_pt: JSON.stringify([
          {
            _type: "block",
            _key: "a",
            children: [{ _type: "span", _key: "s", text: "We feed people" }],
          },
        ]),
      } as INpoPublic,
    });
    await expect
      .element(screen.getByRole("heading", { name: "About" }))
      .toBeVisible();
    await expect.element(screen.getByText("We feed people")).toBeVisible();
    for (const n of [1, 4] as const) {
      expect(screen.getByText(unsdgs[n].title).query()).toBeNull();
    }
  });

  it("lists campaigns, programs, videos and messages, a message by name", async () => {
    const screen = await mount({
      campaigns: [campaign],
      programs: Promise.resolve([
        { id: "p1", title: "Wells", description_pt: "[]" },
      ] as never),
      media: Promise.resolve([
        { id: "m1", url: "https://youtu.be/dQw4w9WgXcQ", featured: true },
        { id: "m2", url: "https://vimeo.com/123", featured: true },
      ] as never),
      messages: [{ id: "d1", name: "Ana", message: "Keep going" }],
    });

    await expect
      .element(screen.getByRole("heading", { name: "Campaigns" }))
      .toBeVisible();
    // the section heading carries no count
    expect(screen.getByText(/\d+ live/).query()).toBeNull();
    await expect
      .element(screen.getByRole("link", { name: /Winter coats/ }))
      .toHaveAttribute("href", "/org/acme/winter");
    await expect
      .element(screen.getByText("$50", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("$100", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /Wells/ }))
      .toHaveAttribute("href", "/org/acme/program/p1");
    await expect
      .element(screen.getByRole("heading", { name: "Media" }))
      .toBeVisible();
    await expect
      .element(screen.getByTitle("Acme Relief video 1"))
      .toBeVisible();
    // a link from before entry was youtube-only stays a plain link
    await expect
      .element(screen.getByRole("link", { name: "https://vimeo.com/123" }))
      .toBeVisible();
    const msg = screen.getByRole("figure");
    await expect.element(msg.getByText("Ana")).toBeVisible();
    await expect.element(msg.getByText("Keep going")).toBeVisible();
  });

  it("names a campaign card's runner, supporters and Share, and donates to the campaign or the fundraiser", async () => {
    const screen = await mount({
      campaigns: [
        campaign,
        {
          ...campaign,
          id: "c2",
          name: "Roof repair",
          to: "/org/acme/roof",
          donate_to: "/org/acme/roof",
          target: undefined,
          supporters: 12,
        },
        {
          ...campaign,
          id: "c3",
          name: "Pantry",
          to: "/org/acme/pantry",
          donate_to: "/org/acme/pantry",
          supporters: null,
        },
      ],
      funds: Promise.resolve([
        fund({}),
        fund({
          id: "f2",
          name: "Org Gala",
          npo_owner: 7,
          creator_name: "Acme Admin",
        }),
      ]),
    });
    const card = (name: string) =>
      screen.getByRole("article").filter({ hasText: name });

    await expect
      .element(card("Winter coats").getByText("Official campaign"))
      .toBeVisible();
    await expect
      .element(card("Winter coats").getByText("1 supporter", { exact: true }))
      .toBeVisible();
    await expect
      .element(card("Winter coats").getByRole("link", { name: "Donate" }))
      .toHaveAttribute("href", "/org/acme/winter");
    await expect
      .element(
        card("Winter coats").getByRole("button", {
          name: "Share Winter coats",
        })
      )
      .toBeVisible();

    await expect
      .element(card("Roof repair").getByText("12 supporters", { exact: true }))
      .toBeVisible();
    await expect
      .element(card("Roof repair").getByText("Raised · no goal set"))
      .toBeVisible();
    expect(
      card("Pantry")
        .getByText(/supporter/)
        .query()
    ).toBeNull();

    // a fundraiser someone else runs carries their name, and its own form
    await expect
      .element(card("Spring Drive").getByText("By Maya Lin"))
      .toBeVisible();
    expect(
      card("Spring Drive")
        .getByText(/supporter/)
        .query()
    ).toBeNull();
    await expect
      .element(card("Spring Drive").getByRole("link", { name: "Donate" }))
      .toHaveAttribute("href", "/fundraisers/f1/donate");
    await expect
      .element(card("Spring Drive").getByRole("link", { name: /Spring Drive/ }))
      .toHaveAttribute("href", "/fundraisers/f1");
    // one the org owns is its own campaign
    await expect
      .element(card("Org Gala").getByText("Official campaign"))
      .toBeVisible();
    expect(card("Org Gala").getByText(/^By /).query()).toBeNull();

    await card("Spring Drive")
      .getByRole("button", { name: "Share Spring Drive" })
      .click();
    await expect
      .element(screen.getByRole("dialog", { name: "Share" }))
      .toBeVisible();
  });

  it("names each video frame by the org and its place in the list", async () => {
    const screen = await mount({
      media: Promise.resolve([
        { id: "m1", url: "https://youtu.be/dQw4w9WgXcQ", featured: true },
        { id: "m2", url: "https://vimeo.com/123", featured: true },
        { id: "m3", url: "https://youtu.be/9bZkp7q19f0", featured: true },
        { id: "m4", url: "https://youtu.be/kJQP7kiw5Fk", featured: true },
      ] as never),
    });
    await expect
      .element(screen.getByRole("heading", { name: "Media" }))
      .toBeVisible();
    // the plain link between them is not a frame and takes no number
    await vi.waitFor(() => {
      const titles = [...screen.container.querySelectorAll("iframe")].map(
        (f) => f.title
      );
      expect(titles).toEqual([
        "Acme Relief video 1",
        "Acme Relief video 2",
        "Acme Relief video 3",
      ]);
    });
  });

  it("plays the first video large, the rest in a row under it, below xl", async () => {
    await page.viewport(1024, 900);
    const screen = await mount_videos();
    const frame = (n: number) => screen.getByTitle(`Acme Relief video ${n}`);
    await expect.element(frame(3)).toBeVisible();
    const box = (n: number) => frame(n).element().getBoundingClientRect();
    expect(box(1).width).toBeGreaterThan(box(2).width * 2);
    expect(box(3).width).toBeCloseTo(box(2).width, 0);
    expect(box(2).top).toBeGreaterThanOrEqual(box(1).bottom);
    expect(box(3).top).toBe(box(2).top);
  });

  it("stacks every video one per row in the xl sidebar", async () => {
    await page.viewport(1440, 900);
    const screen = await mount_videos();
    const frame = (n: number) => screen.getByTitle(`Acme Relief video ${n}`);
    await expect.element(frame(3)).toBeVisible();
    const box = (n: number) => frame(n).element().getBoundingClientRect();
    for (const n of [2, 3]) {
      expect(box(n).left).toBeCloseTo(box(1).left, 0);
      expect(box(n).width).toBeCloseTo(box(1).width, 0);
      expect(box(n).top).toBeGreaterThanOrEqual(box(n - 1).bottom);
    }
  });

  it("bleeds a program's thumbnail to its row's left, top and bottom", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({
      programs: Promise.resolve([
        { id: "p1", title: "Wells", description_pt: "[]", banner: BANNER },
      ] as never),
    });
    const row = screen.getByRole("link", { name: /Wells/ });
    await expect.element(row).toBeVisible();
    const thumb = row.element().querySelector("img")!;
    const r = row.element().getBoundingClientRect();
    const t = thumb.getBoundingClientRect();
    expect(t.left).toBeCloseTo(r.left, 0);
    expect(t.top).toBeCloseTo(r.top, 0);
    expect(t.bottom).toBeCloseTo(r.bottom, 0);
    expect(t.width).toBeGreaterThan(0);
  });

  it("carries the org's mark, name, socials and details in the footer", async () => {
    await page.viewport(1280, 900);
    const screen = await mount({
      npo: {
        ...npo,
        logo: LOGO,
        social_media_urls: { facebook: "https://facebook.com/acme" },
      } as INpoPublic,
    });
    const footer = screen.getByRole("contentinfo");
    await expect.element(footer.getByText("Acme Relief")).toBeVisible();
    expect(footer.element().querySelector("img")?.getAttribute("src")).toBe(
      LOGO
    );
    await expect
      .element(footer.getByRole("link", { name: "Facebook", exact: true }))
      .toHaveAttribute("href", "https://facebook.com/acme");
    await expect
      .element(footer.getByRole("link", { name: /Powered by Better Giving/ }))
      .toHaveAttribute("href", "/");
    // the registration and, with no countries listed, the hq; no address,
    // which this org has none of
    const details = footer.getByRole("region", {
      name: "Organization details",
    });
    await expect.element(details.getByText("EIN123")).toBeVisible();
    await expect.element(details.getByText("Active in")).toBeVisible();
    await expect
      .element(details.getByText("United States", { exact: true }))
      .toBeVisible();
    expect(details.getByText("Address").query()).toBeNull();
    // in the footer alone, at every width
    const main = screen.getByRole("main");
    await expect.element(main.getByRole("heading", { level: 1 })).toBeVisible();
    for (const term of [
      "Organization details",
      "EIN / Registration",
      "EIN123",
    ]) {
      expect(main.getByText(term).query()).toBeNull();
    }
  });
});

function mount_videos() {
  return mount({
    media: Promise.resolve([
      { id: "m1", url: "https://youtu.be/dQw4w9WgXcQ", featured: true },
      { id: "m2", url: "https://youtu.be/9bZkp7q19f0", featured: true },
      { id: "m3", url: "https://youtu.be/kJQP7kiw5Fk", featured: true },
    ] as never),
  });
}

const pt = (...texts: string[]) =>
  JSON.stringify(
    texts.map((text, i) => ({
      _type: "block",
      _key: `b${i}`,
      children: [{ _type: "span", _key: `s${i}`, text }],
    }))
  );

const ABOUT = [
  "We run two shelters on the east side.",
  "Since 2014 we have fed anyone who comes to the door.",
  "Every gift keeps both of them open through the winter.",
];

const SECTIONS = ["About", "Campaigns", "Programs", "Media", "Donor messages"];

function mount_full() {
  return mount({
    npo: { ...npo, overview_pt: pt(...ABOUT) } as INpoPublic,
    campaigns: ["Winter coats", "Roof repair", "Pantry", "Bus passes"].map(
      (name, i) => ({ ...campaign, id: `c${i}`, name, to: `/org/acme/c${i}` })
    ),
    programs: Promise.resolve([
      { id: "p1", title: "Wells", description_pt: "[]" },
    ] as never),
    media: Promise.resolve([
      { id: "m1", url: "https://vimeo.com/123", featured: true },
    ] as never),
    messages: [{ id: "d1", name: "Ana", message: "Keep going" }],
  });
}

type TScreen = Awaited<ReturnType<typeof mount>>;

async function sections(screen: TScreen) {
  const heading = (name: string) =>
    screen.getByRole("heading", { level: 2, name, exact: true });
  for (const name of SECTIONS) {
    await expect.element(heading(name)).toBeVisible();
  }
  return SECTIONS.map(
    (name) => heading(name).element().closest("section") as HTMLElement
  );
}

/** each section follows the one before it in the dom, and nothing a sighted
 * reader meets first comes later: in one column a later section sits below,
 * and of two that start on one line the later sits to the right. two in
 * different columns that start at different heights have no order to keep */
function expect_reading_order(els: HTMLElement[]) {
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      expect(
        els[i].compareDocumentPosition(els[j]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      const a = els[i].getBoundingClientRect();
      const b = els[j].getBoundingClientRect();
      const same_column = a.left < b.right && b.left < a.right;
      if (same_column) expect(b.top).toBeGreaterThanOrEqual(a.bottom);
      else if (Math.abs(a.top - b.top) < 1)
        expect(b.left).toBeGreaterThanOrEqual(a.right);
    }
  }
}

describe("org profile layout", () => {
  it("at 1440, hangs the raised figures off the card's right inset, level with the name", async () => {
    await page.viewport(1440, 900);
    const screen = await mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    await expect.element(h1).toBeVisible();
    const card = h1.element().closest("section")!;
    const inset_right =
      card.getBoundingClientRect().right -
      Number.parseFloat(getComputedStyle(card).paddingRight);
    const stats = [...card.querySelectorAll("dl > div")];
    const amount = stats[0].querySelector("dd")!;
    expect(
      Math.abs(stats.at(-1)!.getBoundingClientRect().right - inset_right)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        amount.getBoundingClientRect().top -
          h1.element().getBoundingClientRect().top
      )
    ).toBeLessThanOrEqual(2);
  });

  it("reads in the order it shows, on a phone and in two columns", async () => {
    await page.viewport(375, 667);
    const phone = await mount_full();
    const one_column = await sections(phone);
    expect_reading_order(one_column);
    // one column: every section starts on the same edge
    expect(
      new Set(one_column.map((s) => s.getBoundingClientRect().left)).size
    ).toBe(1);
    await cleanup();

    await page.viewport(1280, 900);
    const desktop = await mount_full();
    const two_columns = await sections(desktop);
    expect_reading_order(two_columns);
    const [hero, campaigns, , , messages] = two_columns;
    const h = hero.getBoundingClientRect();
    const c = campaigns.getBoundingClientRect();
    const m = messages.getBoundingClientRect();
    // two columns, messages under the hero by the same gap as between the
    // columns, though the right column runs longer
    expect(c.left).toBeGreaterThan(h.right);
    expect(m.left).toBe(h.left);
    expect(m.top - h.bottom).toBeCloseTo(c.left - h.right, 0);
  });

  it("gives the story three parts of the width to the right column's one at 1440", async () => {
    await page.viewport(1440, 900);
    const screen = await mount_full();
    const [hero, campaigns] = await sections(screen);
    const ratio =
      hero.getBoundingClientRect().width /
      campaigns.getBoundingClientRect().width;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.4);
  });

  it("holds About to the reading measure inside the wide xl column", async () => {
    await page.viewport(1440, 900);
    const screen = await mount_full();
    const first = screen.getByText(ABOUT[0]);
    await expect.element(first).toBeVisible();
    expect(first.element().getBoundingClientRect().width).toBeLessThanOrEqual(
      768
    );
    const card = first.element().closest("section") as HTMLElement;
    expect(card.getBoundingClientRect().width).toBeGreaterThan(768);
  });

  it("sets the About paragraphs apart, and holds them to the reading measure on a one-column desktop", async () => {
    await page.viewport(1100, 900);
    const screen = await mount_full();
    const [first, second] = ABOUT.map((t) => screen.getByText(t));
    await expect.element(first).toBeVisible();
    const a = first.element().getBoundingClientRect();
    const b = second.element().getBoundingClientRect();
    expect(b.top - a.bottom).toBeGreaterThanOrEqual(12);
    // max-w-3xl, 768px, inside a card that runs wider
    expect(a.width).toBeLessThanOrEqual(768);
    const card = first.element().closest("section") as HTMLElement;
    expect(card.getBoundingClientRect().width).toBeGreaterThan(768);
  });

  it("reads a gift too small to reach 1% of the goal as <1%, not 0%", async () => {
    await page.viewport(1280, 900);
    const screen = await mount({
      npo: { ...npo, target: "100000" } as INpoPublic,
    });
    await expect
      .element(screen.getByText("<1% of $100,000 goal", { exact: true }))
      .toBeVisible();
  });

  it("names a campaign card's link by the campaign alone, under an h3, and leaves Share and Donate their own clicks", async () => {
    await page.viewport(1280, 900);
    const screen = await mount({ campaigns: [campaign] });
    const card = screen.getByRole("article");
    const heading = card.getByRole("heading", {
      level: 3,
      name: "Winter coats",
      exact: true,
    });
    await expect.element(heading).toBeVisible();
    const link = heading.getByRole("link", {
      name: "Winter coats",
      exact: true,
    });
    await expect.element(link).toHaveAttribute("href", "/org/acme/winter");
    const excerpt = card.getByText(campaign.excerpt).element();
    expect(link.element().contains(excerpt)).toBe(false);

    // the stretch covers the card, the byline above the photo included
    expect(hit(card.getByText("Official campaign").element())).toBe(
      link.element()
    );
    const donate = card.getByRole("link", { name: "Donate", exact: true });
    expect(hit(donate.element())).toBe(donate.element());

    await card.getByRole("button", { name: "Share Winter coats" }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Share" }))
      .toBeVisible();
  });
});

/** a campaign card's byline, its photo and the card's stretched link */
function card_parts(card: Locator) {
  const byline = card.getByText("Official campaign").element();
  const link = card
    .getByRole("heading", { level: 3 })
    .getByRole("link")
    .element();
  const photo = link.closest("h3")!.parentElement!.parentElement!;
  return { byline, photo, link };
}

/** the mast's figures by label, from its definition list */
function mast_stats() {
  const card = document.querySelector("main section")!;
  return Object.fromEntries(
    [...card.querySelectorAll("dl > div")].map((g) => [
      g.querySelector("dt")!.textContent,
      g.querySelector("dd")!.textContent,
    ])
  );
}

/** the link a press at the middle of `el` lands on; below xl the cards sit
 * under the full-width hero, past the fold, where `elementFromPoint` finds
 * nothing */
function hit(el: Element) {
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  return document
    .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    ?.closest("a, button");
}

describe("org profile campaign cards", () => {
  it("below xl, a lone campaign card spans the row, its photo beside the byline, and still opens on a press anywhere", async () => {
    await page.viewport(1024, 900);
    const screen = await mount({ campaigns: [campaign] });
    const card = screen.getByRole("article");
    await expect.element(card).toBeVisible();
    const li = card.element().closest("li")!;
    const ul = li.parentElement!;
    expect(li.getBoundingClientRect().width).toBeCloseTo(
      ul.getBoundingClientRect().width,
      0
    );

    const { byline, photo, link } = card_parts(card);
    expect(photo.getBoundingClientRect().right).toBeLessThanOrEqual(
      byline.getBoundingClientRect().left
    );
    expect(photo.getBoundingClientRect().top).toBe(
      byline.closest("p")!.getBoundingClientRect().top
    );
    expect(hit(byline)).toBe(link);
  });

  it("below xl, two cards stay in two columns, each byline over its photo, the stretch over each", async () => {
    await page.viewport(1024, 900);
    const screen = await mount({
      campaigns: [
        campaign,
        { ...campaign, id: "c2", name: "Roof repair", to: "/org/acme/roof" },
      ],
    });
    const cards = screen.getByRole("article");
    await expect.element(cards.nth(1)).toBeVisible();
    const [a, b] = cards.elements().map((c) => c.getBoundingClientRect());
    expect(b.top).toBe(a.top);
    expect(b.left).toBeGreaterThanOrEqual(a.right);
    expect(b.width).toBeCloseTo(a.width, 0);

    for (const card of cards.all()) {
      const { byline, photo, link } = card_parts(card);
      expect(byline.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        photo.getBoundingClientRect().top
      );
      expect(hit(byline)).toBe(link);
    }
  });

  it("frames a card's photo at the 4:1 its upload was cropped to", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ campaigns: [campaign] });
    const card = screen.getByRole("article");
    await expect.element(card).toBeVisible();
    const { width, height } = card_parts(card).photo.getBoundingClientRect();
    expect(width / height).toBeCloseTo(4, 1);
  });

  it("in the xl sidebar, a lone card stays vertical, its photo under its byline", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ campaigns: [campaign] });
    const card = screen.getByRole("article");
    await expect.element(card).toBeVisible();
    const { byline, photo, link } = card_parts(card);
    expect(byline.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      photo.getBoundingClientRect().top
    );
    expect(hit(byline)).toBe(link);
  });

  it("in the xl sidebar, cards stack one per row", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({
      campaigns: [
        campaign,
        { ...campaign, id: "c2", name: "Roof repair", to: "/org/acme/roof" },
      ],
    });
    const cards = screen.getByRole("article");
    await expect.element(cards.nth(1)).toBeVisible();
    const [a, b] = cards.elements().map((c) => c.getBoundingClientRect());
    expect(b.left).toBeCloseTo(a.left, 0);
    expect(b.width).toBeCloseTo(a.width, 0);
    expect(b.top).toBeGreaterThanOrEqual(a.bottom);
  });
});

/** the card the page opens on, the one holding the org's name */
async function mast_of(screen: TScreen) {
  const h1 = screen.getByRole("heading", { level: 1 });
  await expect.element(h1).toBeVisible();
  return page.elementLocator(h1.element().closest("section") as HTMLElement);
}

describe("org profile header card", () => {
  it("names the org's tagline, designation, country and website, the link without its protocol", async () => {
    const screen = await mount();
    const mast = await mast_of(screen);

    await expect.element(mast.getByText("Food and shelter")).toBeVisible();
    await expect
      .element(mast.getByText("Charity", { exact: true }))
      .toBeVisible();
    await expect
      .element(mast.getByText("United States", { exact: true }))
      .toBeVisible();
    const site = mast.getByRole("link", { name: "acme.example" });
    await expect.element(site).toHaveAttribute("href", "https://acme.example");
    expect(site.element().textContent).toBe("acme.example");
  });

  it("leaves out the designation tag for Other, and keeps the country and website", async () => {
    const screen = await mount({
      npo: { ...npo, endow_designation: "Other" } as INpoPublic,
    });
    const mast = await mast_of(screen);

    await expect
      .element(mast.getByText("United States", { exact: true }))
      .toBeVisible();
    await expect
      .element(mast.getByRole("link", { name: "acme.example" }))
      .toBeVisible();
    expect(mast.getByText("Other").query()).toBeNull();
  });

  it("writes a supporter count in the thousands with its separator", async () => {
    const screen = await mount({
      campaigns: [{ ...campaign, supporters: 1234 }],
    });
    await expect
      .element(screen.getByText("1,234 supporters", { exact: true }))
      .toBeVisible();
  });
});

/** the hero card, found by the banner it opens with */
function hero_of(screen: TScreen) {
  const banner = screen
    .getByRole("main")
    .element()
    .querySelector(`img[src="${BANNER}"]`) as HTMLImageElement;
  return {
    banner,
    hero: page.elementLocator(banner.closest("section") as HTMLElement),
  };
}

const hero_npo = (o: Record<string, unknown> = {}) =>
  ({
    ...npo,
    image: BANNER,
    street_address: "1 Main St",
    overview_pt: pt("We run two shelters."),
    ...o,
  }) as INpoPublic;

describe("org profile hero", () => {
  it("sets About under the banner, with no facts or divider", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ npo: hero_npo() });
    const { hero } = hero_of(screen);

    await expect
      .element(hero.getByRole("heading", { name: "About" }))
      .toBeVisible();
    expect(hero.getByText("1 Main St").query()).toBeNull();
    expect(hero.element().querySelector("hr")).toBeNull();
    expect(hero.element().querySelector("dl")).toBeNull();
  });

  it("is the banner alone when the org has no About", async () => {
    await page.viewport(1440, 900);
    const screen = await mount({ npo: hero_npo({ overview_pt: "[]" }) });
    const { banner, hero } = hero_of(screen);

    await expect.element(page.elementLocator(banner)).toBeVisible();
    expect(hero.element().children).toHaveLength(1);
    expect(banner.parentElement).toBe(hero.element());
  });

  it("shows a phone the banner alone when About is empty, and the story under it when it is not", async () => {
    await page.viewport(375, 667);
    const bare = await mount({ npo: hero_npo({ overview_pt: "[]" }) });
    const bare_hero = hero_of(bare);
    await expect.element(page.elementLocator(bare_hero.banner)).toBeVisible();
    // the card's two borders around the banner, and no padded block under it
    const slack =
      bare_hero.hero.element().getBoundingClientRect().height -
      bare_hero.banner.getBoundingClientRect().height;
    expect(slack).toBeLessThanOrEqual(2);
    await cleanup();

    const told = await mount({ npo: hero_npo() });
    const told_hero = hero_of(told);
    await expect
      .element(told_hero.hero.getByRole("heading", { name: "About" }))
      .toBeVisible();
    expect(
      told_hero.hero.element().getBoundingClientRect().height -
        told_hero.banner.getBoundingClientRect().height
    ).toBeGreaterThan(40);
  });
});

describe("org profile fundraisers", () => {
  const story = pt("Water for the village.");

  it("keeps a fundraiser ending today listed until 12:00 UTC tomorrow, and never an inactive one", async () => {
    // the last second of oct 1 UTC, as the fund list carries it
    const ends = Date.parse("2027-10-01T23:59:59Z") / 1000;
    const funds = () =>
      Promise.resolve([
        fund({ id: "f-today", name: "Today Drive", expiration: ends }),
        fund({ id: "f-off", name: "Paused Drive", active: false }),
        // no end date: on screen once the list has resolved
        fund({ id: "f-open", name: "Ongoing Drive", expiration: 253402300799 }),
      ]);
    const listed_at = async (iso: string) => {
      vi.setSystemTime(new Date(iso));
      const screen = await mount({ funds: funds() });
      await expect
        .element(screen.getByRole("article").filter({ hasText: "Ongoing" }))
        .toBeVisible();
      const names = screen
        .getByRole("article")
        .elements()
        .map((a) => a.querySelector("h3")?.textContent);
      await cleanup();
      return names;
    };

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const both = ["Today Drive", "Ongoing Drive"];
      expect(await listed_at("2027-10-01T15:00:00Z")).toEqual(both);
      expect(await listed_at("2027-10-02T11:59:59.999Z")).toEqual(both);
      expect(await listed_at("2027-10-02T12:00:00Z")).toEqual([
        "Ongoing Drive",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a fundraiser's story as the card's excerpt", async () => {
    const screen = await mount({
      funds: Promise.resolve([fund({ description_pt: story })]),
    });
    const card = screen
      .getByRole("article")
      .filter({ hasText: "Spring Drive" });
    await expect
      .element(card.getByText("Water for the village."))
      .toBeVisible();
  });

  it("puts a fundraiser's banner behind its name and its logo as the mark, the logo behind it without a banner", async () => {
    const OTHER = swatch("green");
    const screen = await mount({
      funds: Promise.resolve([
        fund({ id: "f1", name: "Both Drive", banner: BANNER, logo: LOGO }),
        fund({ id: "f2", name: "Logo Drive", banner: undefined, logo: OTHER }),
        fund({
          id: "f3",
          name: "Bare Drive",
          banner: undefined,
          logo: undefined,
        }),
      ]),
    });
    // the mark first, then the photo behind the name
    const images = async (name: string) => {
      const card = screen.getByRole("article").filter({ hasText: name });
      await expect.element(card).toBeVisible();
      return [...card.element().querySelectorAll("img")].map((i) =>
        i.getAttribute("src")
      );
    };

    expect(await images("Both Drive")).toEqual([LOGO, BANNER]);
    expect(await images("Logo Drive")).toEqual([OTHER, OTHER]);
    expect(await images("Bare Drive")).toEqual([]);
  });
});

describe("org profile donor messages", () => {
  const first = { id: "d1", name: "Ana", message: "Keep going" };
  const row = (
    id: string,
    donor_message: string | null,
    donor_name: string | null = "Ben"
  ) => ({ id, donor_name, donor_message, amount: 250, date: "2026-10-01" });
  /** the cursors asked for, in order */
  const serve = (pages: Record<string, unknown>) => {
    const asked: string[] = [];
    mswWorker.use(
      http.get("/api/npo/7/donors", ({ request }) => {
        const next = new URL(request.url).searchParams.get("next") ?? "";
        asked.push(next);
        const page = pages[next];
        return page === undefined
          ? HttpResponse.json(null, { status: 500 })
          : HttpResponse.json(page);
      })
    );
    return asked;
  };
  type IScreen = Awaited<ReturnType<typeof mount>>;
  const section_of = (screen: IScreen) =>
    (
      screen
        .getByRole("heading", { name: "Donor messages" })
        .element() as HTMLElement
    ).closest("section") as HTMLElement;
  const messages_in = (screen: IScreen) =>
    [...section_of(screen).querySelectorAll("blockquote")].map(
      (q) => q.textContent
    );

  it("View more appends each older page, leaves out blank messages and amounts, and goes once none is left", async () => {
    const asked = serve({
      c2: {
        items: [
          row("d2", "Proud to help"),
          row("d3", null),
          row("d4", "   "),
          row("d5", "From all of us", null),
        ],
        next: "c3",
      },
      c3: { items: [row("d6", "Last one")] },
    });
    const screen = await mount({ messages: [first], messages_next: "c2" });
    const more = screen.getByRole("button", { name: "View more" });

    await more.click();
    await expect.element(screen.getByText("From all of us")).toBeVisible();
    expect(messages_in(screen)).toEqual([
      "Keep going",
      "Proud to help",
      "From all of us",
    ]);
    // a donor without a name signs as Donor
    await expect
      .element(screen.getByText("Donor", { exact: true }))
      .toBeVisible();

    await more.click();
    await expect.element(screen.getByText("Last one")).toBeVisible();
    await expect.element(more).not.toBeInTheDocument();
    expect(messages_in(screen)).toHaveLength(4);
    expect(section_of(screen).textContent).not.toMatch(/\$|250/);
    expect(asked).toEqual(["c2", "c3"]);
  });

  it("a page of blank messages alone is passed over in the same press", async () => {
    const asked = serve({
      c2: { items: [row("d2", null), row("d3", "")], next: "c3" },
      c3: { items: [row("d4", "Worth the wait")] },
    });
    const screen = await mount({ messages: [first], messages_next: "c2" });
    await screen.getByRole("button", { name: "View more" }).click();

    await expect.element(screen.getByText("Worth the wait")).toBeVisible();
    expect(asked).toEqual(["c2", "c3"]);
    await expect
      .element(screen.getByRole("button", { name: "View more" }))
      .not.toBeInTheDocument();
  });

  it("a failed page keeps the messages shown and offers a retry that appends it", async () => {
    const pages: Record<string, unknown> = {};
    serve(pages);
    const screen = await mount({ messages: [first], messages_next: "c2" });
    const more = screen.getByRole("button", { name: "View more" });

    await more.click();
    const alert = screen.getByRole("alert");
    await expect
      .element(alert)
      .toHaveTextContent("Couldn't load more messages.");
    await expect.element(screen.getByText("Keep going")).toBeVisible();
    await expect
      .element(more)
      .toHaveAccessibleDescription("Couldn't load more messages.");

    pages.c2 = { items: [row("d2", "Second try")] };
    await screen.getByRole("button", { name: "Retry" }).click();
    await expect.element(screen.getByText("Second try")).toBeVisible();
    await expect.element(alert).not.toBeInTheDocument();
    await expect.element(more).not.toBeInTheDocument();
  });
});

describe("org profile share targets", () => {
  it("shares the profile's url for the org from the header", async () => {
    const screen = await mount();
    await screen
      .getByRole("banner")
      .getByRole("button", { name: "Share", exact: true })
      .click();

    expect(await shared_via_facebook(screen)).toEqual({
      recipient: "Acme Relief",
      url: "https://x/org/acme",
    });
  });

  it("shares a campaign card's own absolute url for that campaign, not a sibling's", async () => {
    const screen = await mount({
      campaigns: [
        campaign,
        {
          ...campaign,
          id: "c2",
          name: "Roof repair",
          to: "/org/acme/roof",
          donate_to: "/org/acme/roof",
        },
      ],
    });
    await screen.getByRole("button", { name: "Share Roof repair" }).click();

    expect(await shared_via_facebook(screen)).toEqual({
      recipient: "Roof repair",
      url: "https://x/org/acme/roof",
    });
  });

  it("shares a fundraiser card's page, named for the fundraiser", async () => {
    const screen = await mount({
      funds: Promise.resolve([fund({})]),
    });
    await screen.getByRole("button", { name: "Share Spring Drive" }).click();

    expect(await shared_via_facebook(screen)).toEqual({
      recipient: "Spring Drive",
      url: "https://x/fundraisers/f1",
    });
  });
});
