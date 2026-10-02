import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import DeletePrompt from "./route";

vi.mock("#/pages/admin/banking/delete-action", () => ({
  delete_action: vi.fn(),
  delete_loader: vi.fn(),
}));

/** an action held open until the test lets every call so far answer */
const held_action = () => {
  const held: (() => void)[] = [];
  const action = vi.fn(async () => {
    await new Promise<void>((r) => held.push(r));
    return null;
  });
  const release = () => {
    for (const r of held.splice(0)) r();
  };
  return { action, release };
};

const press_escape = () =>
  document.dispatchEvent(
    // cancelable, as a real key press is: ark holds the dialog by preventing it
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );

describe("delete payout method prompt", () => {
  test("opens named, holds Escape and the Close link while the delete is in flight, and closes on Escape once idle", async () => {
    const { action, release } = held_action();
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

    const dialog = screen.getByRole("dialog", {
      name: "Delete payout method",
      exact: true,
    });
    await expect.element(dialog).toBeVisible();

    (
      screen.getByRole("button", { name: "Proceed" }).element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByRole("button", { name: "Submitting..." }))
      .toBeVisible();

    // spread over frames, so at least one lands after ark's deferred listener
    for (let i = 0; i < 5; i++) {
      press_escape();
      await new Promise((r) => requestAnimationFrame(r));
    }
    await expect.element(dialog).toBeVisible();

    // aria-disabled's pointer-events:none doesn't reach the keyboard
    (
      screen.getByRole("link", { name: "Close" }).element() as HTMLElement
    ).focus();
    await userEvent.keyboard("{Enter}");
    await new Promise((r) => requestAnimationFrame(r));
    await expect.element(dialog).toBeVisible();

    release();
    await expect
      .element(screen.getByRole("button", { name: "Proceed" }))
      .toBeVisible();
    await vi.waitFor(() => {
      press_escape();
      expect(dialog.query()).toBeNull();
    });
    await expect.element(screen.getByText("banking list")).toBeVisible();
  });
});
