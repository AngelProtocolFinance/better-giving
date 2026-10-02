import { LayoutDashboard } from "lucide-react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Layout } from "./layout";

vi.mock("#/hooks/use-session", () => ({
  use_session: () => ({
    session: undefined,
    is_loading: false,
    revalidate: vi.fn(),
  }),
}));

const link_groups = [
  {
    links: [
      {
        title: "Overview",
        to: "/dashboard",
        icon: { fn: LayoutDashboard, size: 18 },
        end: true,
      },
    ],
  },
];

describe("dashboard Layout", () => {
  // route focus looks for the first h1 inside `main`, and without one falls
  // back to the whole document — where the chrome's heading comes first
  test("the view renders inside the page's one main landmark, the chrome outside it", async () => {
    const Stub = createRoutesStub([
      {
        path: "/dashboard",
        Component: () => (
          <Layout linkGroups={link_groups} rootRoute="/dashboard" />
        ),
        children: [{ index: true, Component: () => <h1>Donations</h1> }],
      },
    ]);
    const screen = await render(<Stub initialEntries={["/dashboard"]} />);

    const heading = screen.getByRole("heading", { name: "Donations" });
    await expect.element(heading).toBeVisible();
    expect(screen.getByRole("main").elements()).toHaveLength(1);
    const main = screen.getByRole("main").element();
    expect(main.contains(heading.element())).toBe(true);
    expect(main.contains(screen.getByRole("banner").element())).toBe(false);
    expect(main.contains(screen.getByRole("contentinfo").element())).toBe(
      false
    );
  });
});
