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
  test("opens named, and Escape leaves it open while the disable is in flight", async () => {
    // never settles: the submission stays in flight for the rest of the test
    const action = vi.fn(() => new Promise<null>(() => {}));
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

    await expect
      .element(
        screen.getByRole("dialog", { name: "Disable form", exact: true })
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
      press_escape();
      await new Promise((r) => requestAnimationFrame(r));
    }
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await expect.element(screen.getByText("forms list")).toBeVisible();
  });
});
