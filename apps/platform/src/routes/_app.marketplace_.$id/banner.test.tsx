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
            logo: "https://example.com/logo.png",
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
  });
});
