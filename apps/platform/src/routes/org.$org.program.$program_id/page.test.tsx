import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: ComponentType) => Component,
  createClientLoaderCache: () => () => null,
}));
vi.mock("./api", () => ({ loader: () => null, headers: () => ({}) }));

import ProgramPage, { meta } from "./route";

interface IData {
  prog?: object;
  donors?: number | null;
  campaigns?: object[];
}

const data = ({ prog = {}, donors = null, campaigns = [] }: IData = {}) => ({
  npo: {
    id: 7,
    slug: "acme",
    name: "Acme Relief",
    logo: null,
    social_media_urls: { facebook: "https://facebook.com/acme" },
  },
  url: "https://x/org/acme/program/p1",
  prog: {
    id: "p1",
    title: "Wells",
    description_pt: "[]",
    milestones: [],
    ...prog,
  },
  donors,
  campaigns,
});

function mount(d: IData = {}) {
  const Stub = createRoutesStub([
    {
      path: "/org/:org/program/:program_id",
      Component: ProgramPage as never,
      loader: () => data(d),
    },
  ]);
  return render(<Stub initialEntries={["/org/acme/program/p1"]} />);
}

const DONATE_TO = "/donate/7?programId=p1";

describe("program page", () => {
  afterEach(async () => {
    await cleanup();
    await page.viewport(1280, 900);
  });

  it("donates to the program from the header and the aside, and leads back to the org", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Wells" }))
      .toBeVisible();

    const header = screen.getByRole("banner");
    await expect
      .element(header.getByRole("link", { name: "Donate", exact: true }))
      .toHaveAttribute("href", DONATE_TO);
    // no Share, no Favorite: the header's only controls are links
    expect(header.getByRole("button").query()).toBeNull();
    await expect
      .element(screen.getByRole("link", { name: "Donate to this program" }))
      .toHaveAttribute("href", DONATE_TO);

    await expect
      .element(screen.getByRole("link", { name: "Back to Acme Relief" }))
      .toHaveAttribute("href", "/org/acme");
  });

  it("counts donors and draws the goal when it has them, and neither when it doesn't", async () => {
    const counted = await mount({
      prog: { target_raise: 500, total_donations: 100 },
      donors: 12,
    });
    await expect
      .element(counted.getByText("raised from 12 donors"))
      .toBeVisible();
    await expect
      .element(counted.getByRole("progressbar", { name: "Amount raised" }))
      .toBeVisible();
    await expect
      .element(counted.getByText("20% of $500 goal", { exact: true }))
      .toBeVisible();
    await cleanup();

    const bare = await mount({ prog: { total_donations: 100 }, donors: null });
    const aside = bare.getByRole("complementary");
    await expect
      .element(aside.getByText("$100 raised", { exact: true }))
      .toBeVisible();
    expect(aside.getByText("donor").query()).toBeNull();
    expect(bare.getByRole("progressbar").query()).toBeNull();
    expect(bare.getByText("goal").query()).toBeNull();
  });

  it("lists the program's campaigns, each opening its page, and hides the section without any", async () => {
    const screen = await mount({
      campaigns: [
        {
          id: "c1",
          name: "Spring well drive",
          to: "/org/acme/spring-well-drive",
          image: null,
          raised: 400,
          target: "1000",
        },
        {
          id: "c2",
          name: "Pump repairs",
          to: "/org/acme/pump-repairs",
          image: null,
          raised: 40,
          target: undefined,
        },
      ],
    });
    await expect
      .element(
        screen.getByRole("heading", { name: "Campaigns in this program" })
      )
      .toBeVisible();
    // the page's one list, with no milestones
    const section = screen.getByRole("list");
    await expect
      .element(section.getByRole("link", { name: "Spring well drive" }))
      .toHaveAttribute("href", "/org/acme/spring-well-drive");
    await expect
      .element(section.getByRole("link", { name: "Pump repairs" }))
      .toHaveAttribute("href", "/org/acme/pump-repairs");
    await expect
      .element(section.getByText("of $1,000", { exact: true }))
      .toBeVisible();
    // only the campaign with a goal draws a bar
    expect(section.getByRole("progressbar").elements()).toHaveLength(1);
    await expect
      .element(section.getByText("$40 raised", { exact: true }))
      .toBeVisible();
    await cleanup();

    const none = await mount({ campaigns: [] });
    await expect
      .element(none.getByRole("heading", { level: 1, name: "Wells" }))
      .toBeVisible();
    expect(
      none.getByRole("heading", { name: "Campaigns in this program" }).query()
    ).toBeNull();
  });

  it("shows a milestone timeline, and none without milestones", async () => {
    const screen = await mount({
      prog: {
        milestones: [
          {
            title: "Drill first well",
            description_pt: "[]",
            date: "2020-01-02T00:00:00.000Z",
          },
        ],
      },
    });
    await expect
      .element(screen.getByRole("heading", { name: "Milestones" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Drill first well" }))
      .toBeVisible();
    await expect.element(screen.getByText("Jan 2, 2020")).toBeVisible();
    await cleanup();

    const none = await mount();
    await expect
      .element(none.getByRole("heading", { level: 1, name: "Wells" }))
      .toBeVisible();
    expect(
      none.getByRole("heading", { name: "Milestones" }).query()
    ).toBeNull();
  });

  it("on a phone, pins nothing to the bottom and ends on the platform credit alone", async () => {
    await page.viewport(375, 667);
    const screen = await mount();
    await expect
      .element(screen.getByRole("link", { name: "Donate to this program" }))
      .toBeVisible();

    const fixed = [...document.body.querySelectorAll("*")].filter(
      (el) => getComputedStyle(el).position === "fixed"
    );
    expect(fixed).toEqual([]);

    const footer = screen.getByRole("contentinfo");
    await expect
      .element(footer.getByRole("link", { name: "Powered by Better Giving" }))
      .toHaveAttribute("href", "/");
    expect(footer.getByRole("link").elements()).toHaveLength(1);
    expect(footer.getByText("Acme Relief").query()).toBeNull();
  });

  it("shares its banner, or the default image without one", () => {
    const og_image = (prog: object) =>
      (meta as any)({ loaderData: data({ prog }) }).find(
        (m: { property?: string }) => m.property === "og:image"
      )?.content;

    expect(og_image({ banner: "https://x/banner.png" })).toBe(
      "https://x/banner.png"
    );
    expect(og_image({ banner: null })).toMatch(/\/og-default\.png$/);
  });
});
