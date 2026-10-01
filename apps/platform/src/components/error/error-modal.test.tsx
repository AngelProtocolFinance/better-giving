import { createRoutesStub, data, Outlet } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ErrorModal } from "./error-modal";

const Stub = createRoutesStub([
  {
    path: "/dashboard/donations",
    Component: () => (
      <div>
        <p>Donations list</p>
        <Outlet />
      </div>
    ),
    children: [
      {
        path: ":id",
        loader: () => {
          throw data(null, { status: 404 });
        },
        Component: () => <p>Donation detail</p>,
        ErrorBoundary: ErrorModal,
      },
    ],
  },
]);

describe("ErrorModal", () => {
  test("ok on a loader error leaves for the parent instead of re-throwing", async () => {
    const screen = await render(
      <Stub initialEntries={["/dashboard/donations/foreign-id"]} />
    );

    await expect
      .element(screen.getByText("The resource you requested was not found."))
      .toBeVisible();

    // native click — the modal backdrop intercepts playwright's pointer check
    (
      screen.getByRole("button", { name: "Ok" }).element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("The resource you requested was not found."))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Donations list")).toBeVisible();
  });
});
