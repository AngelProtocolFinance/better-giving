import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import DisablePrompt from "./route";

vi.mock("#/.server/auth", () => ({ admin_ctx: {} }));
vi.mock("#/.server/toast", () => ({ redirectWithSuccess: vi.fn() }));
vi.mock("$/pg/queries/form", () => ({
  form_get: vi.fn(),
  form_update: vi.fn(),
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

describe("admin disable-form prompt", () => {
  test("opens named, Escape leaves it open while the disable is in flight and closes it once idle", async () => {
    const { action, release } = held_action();
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/forms",
        Component: () => (
          <div>
            <p>forms list</p>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: ":form_id/disable",
            Component: DisablePrompt,
            action,
            HydrateFallback: () => null,
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/admin/1/forms/f-1/disable"]} />
    );

    const dialog = screen.getByRole("dialog", {
      name: "Disable form",
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

    release();
    await expect
      .element(screen.getByRole("button", { name: "Proceed" }))
      .toBeVisible();
    await vi.waitFor(() => {
      press_escape();
      expect(dialog.query()).toBeNull();
    });
    await expect.element(screen.getByText("forms list")).toBeVisible();
  });
});
