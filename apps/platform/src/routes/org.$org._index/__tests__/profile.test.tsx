import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { unsdgs } from "#/constants/unsdgs";
import type { IFundItem } from "@/fundraiser";
import type { INpoPublic } from "$/pg/queries/npo";
import { type IProfile, Profile } from "../profile";

// a signed-in viewer is what puts the favorite button in the header
const user_mock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: user_mock.current, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  user_mock.current = null;
  await page.viewport(1280, 900);
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

const empty: IProfile = {
  npo,
  url: "https://x/org/acme",
  donors: 3,
  messages: [],
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
    // to the viewport, which is what the old phone action bar was
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

  it("shows raised and donors, with no form, no FAQ and no goal bar without a target", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByText("$90 raised from 3 donors", { exact: true }))
      .toBeVisible();
    expect(screen.getByRole("progressbar").query()).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getByText(/frequently asked/i).query()).toBeNull();
    expect(screen.getByText(/tax-deductible/i).query()).toBeNull();
  });

  it("reads just raised when the donor count is unavailable", async () => {
    const screen = await mount({ donors: null });
    await expect
      .element(screen.getByText("$90 raised", { exact: true }))
      .toBeVisible();
    expect(screen.getByText("raised from").query()).toBeNull();
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

  it("lists the org's details in the hero card on desktop, not on a phone", async () => {
    const screen = await mount();
    const main = screen.getByRole("main");
    await expect.element(main.getByText("EIN / Registration")).toBeVisible();
    await expect.element(main.getByText("EIN123")).toBeVisible();
    await expect.element(main.getByText("Active in")).toBeVisible();
    expect(main.getByText("Address").query()).toBeNull();

    await page.viewport(375, 667);
    await expect.element(main.getByText("EIN123")).not.toBeVisible();
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

  it("plays the first video large, the rest in a row under it", async () => {
    await page.viewport(1280, 900);
    const screen = await mount({
      media: Promise.resolve([
        { id: "m1", url: "https://youtu.be/dQw4w9WgXcQ", featured: true },
        { id: "m2", url: "https://youtu.be/9bZkp7q19f0", featured: true },
        { id: "m3", url: "https://youtu.be/kJQP7kiw5Fk", featured: true },
      ] as never),
    });
    const frame = (n: number) => screen.getByTitle(`Acme Relief video ${n}`);
    await expect.element(frame(3)).toBeVisible();
    const box = (n: number) => frame(n).element().getBoundingClientRect();
    expect(box(1).width).toBeGreaterThan(box(2).width * 2);
    expect(box(3).width).toBeCloseTo(box(2).width, 0);
    expect(box(2).top).toBeGreaterThanOrEqual(box(1).bottom);
    expect(box(3).top).toBe(box(2).top);
  });

  it("carries the org's mark, name, socials and details in the footer", async () => {
    const screen = await mount({
      npo: {
        ...npo,
        social_media_urls: { facebook: "https://facebook.com/acme" },
      } as INpoPublic,
    });
    const footer = screen.getByRole("contentinfo");
    await expect.element(footer.getByText("Acme Relief")).toBeVisible();
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
    // on a phone, in the footer alone
    await page.viewport(375, 667);
    await expect
      .element(screen.getByRole("main").getByText("EIN123"))
      .not.toBeVisible();
    expect(
      screen.getByRole("main").getByText("Organization details").query()
    ).toBeNull();
  });
});

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

    const hit = (el: Element) => {
      const r = el.getBoundingClientRect();
      return document
        .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        ?.closest("a, button");
    };
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
