import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { OrgHeader } from "./header";

const user_mock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: user_mock.current, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  user_mock.current = null;
});

const header = (name = "Acme Relief") => (
  <MemoryRouter>
    <OrgHeader
      name={name}
      to="/org/acme"
      bookmark={{ id: 7, name }}
      share={{ recipientName: name, url: "https://x/org/acme" }}
      donate_to="/donate/7"
    />
  </MemoryRouter>
);

describe("org header", () => {
  it("makes Favorite a 44px button in Share's ink, signed in or not", async () => {
    await page.viewport(1280, 900);
    for (const user of [{ bookmarks: [] }, null]) {
      user_mock.current = user;
      const screen = await render(header());
      const fav = screen.getByRole("button", { name: "Add to favorites" });
      await expect.element(fav).toBeVisible();
      const box = fav.element().getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const ink = (name: string) =>
        getComputedStyle(
          screen
            .getByRole("button", { name, exact: true })
            .element()
            .querySelector("svg") as SVGElement
        ).color;
      expect(ink("Add to favorites")).toBe(ink("Share"));
      await cleanup();
    }
  });

  it("narrows Donate's side padding on a phone", async () => {
    const inset = async (width: number) => {
      await page.viewport(width, 800);
      const screen = await render(header());
      const donate = screen.getByRole("link", { name: "Donate" });
      await expect.element(donate).toBeVisible();
      const { paddingLeft, paddingRight } = getComputedStyle(donate.element());
      await cleanup();
      return [paddingLeft, paddingRight];
    };
    expect(await inset(375)).toEqual(["16px", "16px"]);
    expect(await inset(640)).toEqual(["24px", "24px"]);
  });

  it("observes the header once per mount, across re-renders, and lets go on unmount", async () => {
    await page.viewport(1280, 900);
    const counts = { made: 0, disconnected: 0 };
    const Real = globalThis.IntersectionObserver;
    vi.stubGlobal(
      "IntersectionObserver",
      class extends Real {
        constructor(...args: ConstructorParameters<typeof Real>) {
          super(...args);
          counts.made++;
        }
        disconnect() {
          counts.disconnected++;
          super.disconnect();
        }
      }
    );
    const screen = await render(header());
    await expect.element(screen.getByRole("banner")).toBeVisible();
    await screen.rerender(header("Acme Relief International"));
    await expect
      .element(screen.getByRole("link", { name: "Acme Relief International" }))
      .toBeVisible();
    expect(counts).toEqual({ made: 1, disconnected: 0 });
    await screen.unmount();
    expect(counts).toEqual({ made: 1, disconnected: 1 });
  });
});
