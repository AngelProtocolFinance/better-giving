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

describe("public profile banner", () => {
  test("the saved banner is covered, not stretched, in the hero frame", async () => {
    const Stub = createRoutesStub([
      {
        path: "/marketplace/:id",
        Component: Profile,
        loader: () => ({
          npo: {
            id: 7,
            name: "Acme Relief",
            image: "https://example.com/banner.png",
            // a real pixel, so the logo img stays mounted and its fit is readable
            logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            tagline: "Food and shelter",
            hq_country: "United States",
            url: "https://acme.example",
            contributions_total: 0,
            target: null,
          },
          funds: Promise.resolve([]),
          media: Promise.resolve([]),
          programs: Promise.resolve([]),
        }),
      },
    ]);
    const screen = await render(<Stub initialEntries={["/marketplace/7"]} />);
    await expect
      .element(screen.getByRole("heading", { name: "Acme Relief" }))
      .toBeVisible();
    const banner = document.querySelector(
      '[style*="banner.png"]'
    ) as HTMLElement | null;
    expect(banner).not.toBeNull();
    const fit = getComputedStyle(banner!).backgroundSize;
    expect(fit).toBe("cover");
    expect(banner!.className).toContain("bg-cover");
    expect(banner!.className).not.toContain("bg-[length:");

    // the round logo is object-cover on the light panel. clear pixels in a
    // cropped png have to stay clear, or this ground cannot show through.
    await vi.waitFor(() => {
      const img = document.querySelector(
        "img.rounded-full"
      ) as HTMLImageElement | null;
      expect(img?.complete).toBe(true);
    });
    const logo = document.querySelector("img.rounded-full") as HTMLImageElement;
    const logo_style = getComputedStyle(logo);
    expect(logo_style.objectFit).toBe("cover");
    // the panel token is a light oklch. a logo with baked-in black cannot
    // show this ground through its clear pixels.
    const panel = logo_style.backgroundColor;
    expect(panel).toMatch(/^oklch\(/);
    expect(Number.parseFloat(panel.slice("oklch(".length))).toBeGreaterThan(
      0.9
    );
  });
});
