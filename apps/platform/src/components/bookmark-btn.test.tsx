import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { BookmarkBtn } from "./bookmark-btn";

const user_mock = vi.hoisted(() => ({ current: null as unknown }));
const toggle_mock = vi.hoisted(() => vi.fn());
vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: user_mock.current, toggle_bookmark: toggle_mock }),
}));

afterEach(async () => {
  await cleanup();
  user_mock.current = null;
  toggle_mock.mockReset();
});

const npo = { id: 7, name: "Acme Relief" };
const btn = (entry = "/org/acme") => (
  <MemoryRouter initialEntries={[entry]}>
    <BookmarkBtn npo={npo} />
  </MemoryRouter>
);

describe("favorites heart", () => {
  it("sends a signed-out visitor to log in and back to the page they were on", async () => {
    const screen = await render(btn("/org/acme?ref=share"));
    const fav = screen.getByRole("link", {
      name: "Add to favorites",
      exact: true,
    });
    await expect
      .element(fav)
      .toHaveAttribute("href", "/login?redirect=%2Forg%2Facme%3Fref%3Dshare");
    expect(screen.getByRole("button").query()).toBeNull();
  });

  it("announces its saved state under one name, and pressing it toggles", async () => {
    const user = { bookmarks: [] };
    user_mock.current = user;
    toggle_mock.mockResolvedValue(undefined);
    const screen = await render(btn());
    const fav = screen.getByRole("button", {
      name: "Add to favorites",
      exact: true,
    });
    await expect.element(fav).toHaveAttribute("aria-pressed", "false");

    await fav.click();
    expect(toggle_mock).toHaveBeenCalledWith(npo, user);

    user_mock.current = { bookmarks: [npo] };
    await screen.rerender(btn());
    await expect.element(fav).toHaveAttribute("aria-pressed", "true");
  });
});
