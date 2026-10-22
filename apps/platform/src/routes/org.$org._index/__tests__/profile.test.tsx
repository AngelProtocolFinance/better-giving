import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import type { INpoPublic } from "$/pg/queries/npo";
import { type IProfile, Profile } from "../profile";

vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: null, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
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
    expect(screen.getByText("Goals").query()).toBeNull();
    expect(screen.getByText("Address").query()).toBeNull();
    expect(
      screen.getByRole("link", { name: "Facebook", exact: true }).query()
    ).toBeNull();
  });

  it("shows raised and donors above a Donate link, with no form, no FAQ and no goal bar without a target", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByText("raised from 3 donors"))
      .toBeVisible();
    expect(screen.getByRole("progressbar").query()).toBeNull();
    const donate = screen.getByRole("link", { name: "Donate", exact: true });
    for (const el of donate.elements()) {
      expect(el.getAttribute("href")).toBe("/donate/7");
    }
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getByText(/frequently asked/i).query()).toBeNull();
    expect(screen.getByText(/tax-deductible/i).query()).toBeNull();
  });

  it("reads just raised when the donor count is unavailable", async () => {
    const screen = await mount({ donors: null });
    await expect
      .element(screen.getByText("raised", { exact: true }))
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

  it("lists campaigns, programs, videos and messages, a message by name with no amount", async () => {
    const screen = await mount({
      campaigns: [
        {
          id: "c1",
          name: "Winter coats",
          to: "/org/acme/winter",
          image: null,
          raised: 50,
          target: "100",
        },
      ],
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
      .element(screen.getByRole("link", { name: /Winter coats/ }))
      .toHaveAttribute("href", "/org/acme/winter");
    await expect.element(screen.getByText("$50 of $100")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /Wells/ }))
      .toHaveAttribute("href", "/org/acme/program/p1");
    await expect
      .element(screen.getByRole("heading", { name: "Media" }))
      .toBeVisible();
    // a link from before entry was youtube-only stays a plain link
    await expect
      .element(screen.getByRole("link", { name: "https://vimeo.com/123" }))
      .toBeVisible();
    const msg = screen.getByRole("figure");
    await expect.element(msg.getByText("Ana")).toBeVisible();
    await expect.element(msg.getByText("Keep going")).toBeVisible();
    expect(msg.element().textContent).not.toMatch(/\$/);
  });

  it("carries the org's mark, name and socials in header and footer", async () => {
    const screen = await mount({
      npo: {
        ...npo,
        social_media_urls: { facebook: "https://facebook.com/acme" },
      } as INpoPublic,
    });
    const home = screen.getByRole("banner").getByRole("link");
    await expect.element(home).toHaveAttribute("href", "/org/acme");
    await expect.element(home).toHaveTextContent("Acme Relief");
    const footer = screen.getByRole("contentinfo");
    await expect.element(footer.getByText("Acme Relief")).toBeVisible();
    await expect
      .element(footer.getByRole("link", { name: "Facebook", exact: true }))
      .toHaveAttribute("href", "https://facebook.com/acme");
    await expect
      .element(footer.getByRole("link", { name: /Powered by Better Giving/ }))
      .toHaveAttribute("href", "/");
  });
});
