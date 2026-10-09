import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import Page from "./route";

vi.mock("./api", () => ({ action: vi.fn() }));

describe("log interest dialog", () => {
  test("opens named for its purpose", async () => {
    const Stub = createRoutesStub([
      {
        path: "/platform/savings",
        Component: () => (
          <div>
            <p>savings</p>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: "log-interest",
            Component: Page,
            HydrateFallback: () => null,
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/platform/savings/log-interest"]} />
    );

    await expect
      .element(
        screen.getByRole("dialog", { name: "Log interest", exact: true })
      )
      .toBeVisible();
    await expect.element(screen.getByLabelText("Amount ($)")).toBeVisible();
  });
});
