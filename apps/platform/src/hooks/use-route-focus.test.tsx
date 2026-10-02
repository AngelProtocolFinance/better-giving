import { createRoutesStub, Link, Outlet, useSearchParams } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RouteModal } from "#/components/route-modal";
import { use_route_focus } from "./use-route-focus";

function Shell() {
  use_route_focus();
  return (
    <>
      <nav>
        <Link to="/b">to b</Link>
        <Link to="/a?tab=2">tab 2</Link>
        <Link to="/a/edit">edit</Link>
        <Link to="/b" preventScrollReset>
          b in place
        </Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}

function PageA() {
  const [params] = useSearchParams();
  return (
    <>
      <h1>page a</h1>
      <p>tab {params.get("tab") ?? "1"} open</p>
      <Outlet />
    </>
  );
}

const Stub = createRoutesStub([
  {
    Component: Shell,
    children: [
      {
        path: "/a",
        Component: PageA,
        children: [
          {
            path: "edit",
            Component: () => (
              <RouteModal title="edit a">
                <button type="button">save</button>
              </RouteModal>
            ),
          },
        ],
      },
      { path: "/b", Component: () => <h1>page b</h1> },
    ],
  },
]);

// effects and ark's deferred focus moves land within a frame of the commit
const settle = () =>
  new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));

describe("use_route_focus", () => {
  test("a keyboard navigation to a new page focuses its heading, without a ring", async () => {
    const screen = await render(<Stub initialEntries={["/a"]} />);
    await expect
      .element(screen.getByRole("heading", { name: "page a" }))
      .toBeVisible();
    expect(document.activeElement).toBe(document.body);

    (
      screen.getByRole("link", { name: "to b" }).element() as HTMLElement
    ).focus();
    await userEvent.keyboard("{Enter}");

    const heading = screen.getByRole("heading", { name: "page b" });
    await expect.element(heading).toHaveFocus();
    expect(heading.element().matches(":focus-visible")).toBe(true);
    expect(getComputedStyle(heading.element()).outlineStyle).toBe("none");
  });

  test("a search-param change keeps focus where it was", async () => {
    const screen = await render(<Stub initialEntries={["/a"]} />);
    const tab = screen.getByRole("link", { name: "tab 2" });

    await tab.click();

    await expect.element(screen.getByText("tab 2 open")).toBeVisible();
    await settle();
    await expect.element(tab).toHaveFocus();
  });

  test("a preventScrollReset navigation keeps focus where it was", async () => {
    const screen = await render(<Stub initialEntries={["/a"]} />);
    const link = screen.getByRole("link", { name: "b in place" });

    await link.click();

    await expect
      .element(screen.getByRole("heading", { name: "page b" }))
      .toBeVisible();
    await settle();
    await expect.element(link).toHaveFocus();
  });

  test("a child route's dialog keeps focus, then hands it back to its trigger", async () => {
    const screen = await render(<Stub initialEntries={["/a"]} />);
    const trigger = screen.getByRole("link", { name: "edit" });

    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "edit a" });
    await expect.element(dialog).toBeVisible();
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);
    await settle();
    expect(dialog.element().contains(document.activeElement)).toBe(true);

    await vi.waitFor(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(dialog.query()).toBeNull();
    });
    await settle();
    await expect.element(trigger).toHaveFocus();
  });
});
