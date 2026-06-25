import { Dialog } from "@ark-ui/react/dialog";
import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RouteModal } from "./route-modal";

function Modal() {
  return (
    <RouteModal>
      <Dialog.Content className="bg-popover p-4">
        <p>modal body</p>
      </Dialog.Content>
    </RouteModal>
  );
}

function stub() {
  return createRoutesStub([
    {
      path: "/parent",
      Component: () => (
        <div>
          <p>parent route</p>
          <Outlet />
        </div>
      ),
      children: [
        {
          path: "child",
          Component: () => <Modal />,
          HydrateFallback: () => null,
        },
      ],
    },
  ]);
}

describe("RouteModal", () => {
  test("renders children inside a portal", async () => {
    const Stub = stub();
    const screen = await render(
      <Stub
        initialEntries={["/parent/child"]}
        future={{ v8_middleware: true }}
      />
    );
    await expect.element(screen.getByText("modal body")).toBeVisible();
    await expect.element(screen.getByText("parent route")).toBeVisible();
  });

  test("Escape closes by navigating to parent (default '..')", async () => {
    const Stub = stub();
    const screen = await render(
      <Stub
        initialEntries={["/parent/child"]}
        future={{ v8_middleware: true }}
      />
    );
    await expect.element(screen.getByText("modal body")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByText("modal body"))
      .not.toBeInTheDocument();
  });
});
