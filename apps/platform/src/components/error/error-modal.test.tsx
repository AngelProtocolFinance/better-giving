import { createRoutesStub, data, Outlet, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ErrorModal } from "./error-modal";

const NOT_FOUND = "The resource you requested was not found.";

function Parent() {
  const { pathname, search } = useLocation();
  return (
    <div>
      <p data-testid="at">{pathname + search}</p>
      <Outlet />
    </div>
  );
}

type StubRoute = Parameters<typeof createRoutesStub>[0][number];

const failing_child = (path: string): StubRoute => ({
  path,
  loader: () => {
    throw data(null, { status: 404 });
  },
  Component: () => <p>Child content</p>,
  ErrorBoundary: ErrorModal,
});

async function open_at(routes: StubRoute[], entry: string) {
  const Stub = createRoutesStub(routes);
  const screen = await render(<Stub initialEntries={[entry]} />);
  await expect.element(screen.getByText(NOT_FOUND)).toBeVisible();
  await expect
    .element(
      screen.getByRole("dialog", { name: "Something went wrong", exact: true })
    )
    .toBeVisible();
  return screen;
}

function press_ok(screen: Awaited<ReturnType<typeof open_at>>) {
  // native click — the modal backdrop intercepts playwright's pointer check
  (screen.getByRole("button", { name: "Ok" }).element() as HTMLElement).click();
}

async function expect_closed_at(
  screen: Awaited<ReturnType<typeof open_at>>,
  url: string
) {
  await expect.element(screen.getByText(NOT_FOUND)).not.toBeInTheDocument();
  await expect.element(screen.getByTestId("at")).toHaveTextContent(url);
}

describe("ErrorModal", () => {
  test("names the failure once in the dialog's accessible tree", async () => {
    const screen = await open_at(
      [
        {
          path: "/dashboard/donations",
          Component: Parent,
          children: [failing_child(":id")],
        },
      ],
      "/dashboard/donations/foreign-id"
    );
    const dialog = screen.getByRole("dialog", { name: "Something went wrong" });
    expect(dialog.getByText("Something went wrong").elements()).toHaveLength(1);
  });

  test("ok on a loader error leaves for the parent instead of re-throwing", async () => {
    const screen = await open_at(
      [
        {
          path: "/dashboard/donations",
          Component: Parent,
          children: [failing_child(":id")],
        },
      ],
      "/dashboard/donations/foreign-id"
    );
    press_ok(screen);
    await expect_closed_at(screen, "/dashboard/donations");
  });

  // marketplace filter modal: _app (pathless) > marketplace > filter
  test("closing keeps the parent's query string", async () => {
    const screen = await open_at(
      [
        {
          id: "_app",
          Component: Outlet,
          children: [
            {
              path: "marketplace",
              Component: Parent,
              children: [failing_child("filter")],
            },
          ],
        },
      ],
      "/marketplace/filter?q=x"
    );
    press_ok(screen);
    await expect_closed_at(screen, "/marketplace?q=x");
  });

  // platform.applications_.$id.$verdict: parent's path spans two segments
  test("from a _-suffixed parent lands on that parent's full path", async () => {
    const screen = await open_at(
      [
        {
          path: "/platform",
          Component: Outlet,
          children: [
            {
              path: "applications/:id",
              Component: Parent,
              children: [failing_child(":verdict")],
            },
          ],
        },
      ],
      "/platform/applications/abc/approve"
    );
    press_ok(screen);
    await expect_closed_at(screen, "/platform/applications/abc");
  });

  test("under a pathless layout parent lands on the nearest pathful route", async () => {
    const screen = await open_at(
      [
        {
          path: "/dashboard/donations",
          Component: Parent,
          children: [
            {
              id: "layout",
              Component: Outlet,
              children: [failing_child(":id")],
            },
          ],
        },
      ],
      "/dashboard/donations/foreign-id?page=2"
    );
    press_ok(screen);
    await expect_closed_at(screen, "/dashboard/donations?page=2");
  });

  test("escape closes the same way as ok", async () => {
    const screen = await open_at(
      [
        {
          id: "_app",
          Component: Outlet,
          children: [
            {
              path: "marketplace",
              Component: Parent,
              children: [failing_child("filter")],
            },
          ],
        },
      ],
      "/marketplace/filter?q=x"
    );
    // ark registers its keydown listener a frame late — retry until it lands
    await vi.waitFor(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(document.body).not.toMatchTextContent(NOT_FOUND);
    });
    await expect_closed_at(screen, "/marketplace?q=x");
  });
});
