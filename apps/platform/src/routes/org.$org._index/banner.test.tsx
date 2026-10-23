import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import "#/index.css";

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: ComponentType) => Component,
  createClientLoaderCache: () => () => null,
}));

vi.mock("./api", () => ({
  loader: () => null,
  headers: () => ({}),
}));

import Profile from "./route";

// a real 2x1 pixel, so the banner img stays mounted rather than falling back
const BANNER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGM8kWLEwMAAAAd6AWCUFlkyAAAAAElFTkSuQmCC";

describe("public profile banner", () => {
  test("the saved banner is covered, not stretched, in the hero frame", async () => {
    const Stub = createRoutesStub([
      {
        path: "/org/:org",
        Component: Profile,
        loader: () => ({
          npo: {
            id: 7,
            name: "Acme Relief",
            endow_designation: "Charity",
            image: BANNER,
            // a real pixel, so the logo img stays mounted and its fit is readable
            logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            tagline: "Food and shelter",
            hq_country: "United States",
            url: "https://acme.example",
            overview_pt: "[]",
            active_in_countries: [],
            sdgs: [],
            social_media_urls: null,
            contributions_total: 0,
            target: null,
          },
          url: "https://x/org/7",
          donors: 0,
          messages: [],
          campaigns: [],
          funds: Promise.resolve([]),
          media: Promise.resolve([]),
          programs: Promise.resolve([]),
        }),
      },
    ]);
    const screen = await render(<Stub initialEntries={["/org/7"]} />);
    await expect
      .element(screen.getByRole("heading", { name: "Acme Relief", level: 1 }))
      .toBeVisible();
    const banner = document.querySelector(
      `img[src="${BANNER}"]`
    ) as HTMLImageElement | null;
    expect(banner).not.toBeNull();
    expect(getComputedStyle(banner!).objectFit).toBe("cover");
    // the frame is 4:1 whatever the saved image's own shape
    const { width, height } = banner!.getBoundingClientRect();
    expect(width / height).toBeCloseTo(4, 1);

    // the logo is object-cover on a light ground. clear pixels in a cropped
    // png have to stay clear, or this ground cannot show through.
    const logo_of = () =>
      document.querySelector("main section img") as HTMLImageElement | null;
    await vi.waitFor(() => expect(logo_of()?.complete).toBe(true));
    const logo_style = getComputedStyle(logo_of()!);
    expect(logo_style.objectFit).toBe("cover");
    // the ground token is a light oklch. a logo with baked-in black cannot
    // show this ground through its clear pixels.
    const panel = logo_style.backgroundColor;
    expect(panel).toMatch(/^oklch\(/);
    expect(Number.parseFloat(panel.slice("oklch(".length))).toBeGreaterThan(
      0.9
    );
  });
});
