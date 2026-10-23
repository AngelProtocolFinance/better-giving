import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { OrgHeader } from "./header";

const user_mock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: user_mock.current, toggle_bookmark: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  user_mock.current = null;
  await reset_viewport();
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
  it("makes Favorite a 44px target in Share's ink, signed in or not", async () => {
    await page.viewport(1280, 900);
    // signed out it is a link to log in, signed in a toggle button
    for (const [user, role] of [
      [{ bookmarks: [] }, "button"],
      [null, "link"],
    ] as const) {
      user_mock.current = user;
      const screen = await render(header());
      const fav = screen.getByRole(role, {
        name: "Add to favorites",
        exact: true,
      });
      await expect.element(fav).toBeVisible();
      const box = fav.element().getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const ink = (el: Element) =>
        getComputedStyle(el.querySelector("svg") as SVGElement).color;
      const share = screen.getByRole("button", { name: "Share", exact: true });
      expect(ink(fav.element())).toBe(ink(share.element()));
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
