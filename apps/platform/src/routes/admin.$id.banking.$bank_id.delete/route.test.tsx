import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import DeletePrompt from "./route";

vi.mock("#/pages/admin/banking/delete-action", () => ({
  delete_action: vi.fn(),
  delete_loader: vi.fn(),
}));

describe("delete payout method prompt", () => {
  test("opens named, and Escape leaves it open while the delete is in flight", async () => {
    // never settles: the submission stays in flight for the rest of the test
    const action = vi.fn(() => new Promise<null>(() => {}));
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/banking",
        Component: () => (
          <div>
            <p>banking list</p>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: ":bank_id/delete",
            Component: DeletePrompt,
            loader: () => ({ is_default: false, is_guarded: false }),
            action,
            HydrateFallback: () => null,
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/admin/1/banking/7/delete"]} />
    );

    await expect
      .element(
        screen.getByRole("dialog", {
          name: "Delete payout method",
          exact: true,
        })
      )
      .toBeVisible();

    (
      screen.getByRole("button", { name: "Proceed" }).element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByRole("button", { name: "Submitting..." }))
      .toBeVisible();

    // spread over frames, so at least one lands after ark's deferred listener
    for (let i = 0; i < 5; i++) {
      document.dispatchEvent(
        // cancelable, as a real key press is: ark holds the dialog by preventing it
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
      await new Promise((r) => requestAnimationFrame(r));
    }
    await expect.element(screen.getByRole("dialog")).toBeVisible();
  });
});
