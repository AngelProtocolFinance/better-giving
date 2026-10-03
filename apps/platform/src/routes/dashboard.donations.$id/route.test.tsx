import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { layer_ready, settle_frames } from "#/__tests__/fixtures/layer-ready";

const api = vi.hoisted(() => ({
  action: vi.fn(),
  loader: vi.fn(),
}));
vi.mock("./api", () => api);

import Page from "./route";

describe("receipt dialog while its form submits", () => {
  test("holds Escape until the resend resolves, then closes on it", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    api.action.mockImplementation(async () => {
      await held;
      return { error: "could not send" };
    });
    const Stub = createRoutesStub([
      {
        path: "/dashboard/donations",
        Component: () => (
          <>
            <p>donations list</p>
            <Outlet />
          </>
        ),
        children: [
          {
            path: ":id",
            Component: Page as any,
            HydrateFallback: () => null,
            loader: () => ({
              first_name: "Ada",
              last_name: "Lovelace",
              email: "ada@test.com",
            }),
            action: api.action,
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/dashboard/donations/don-1"]} />
    );
    const title = screen.getByRole("heading", { name: /view receipt/i });
    await expect.element(title).toBeVisible();

    await layer_ready();
    // the dialog's backdrop intercepts playwright's pointer actionability
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();
    await vi.waitFor(() => expect(api.action).toHaveBeenCalledOnce());

    await userEvent.keyboard("{Escape}");
    await settle_frames();
    await expect.element(title).toBeVisible();

    release();
    // the same press now closes it: proof the listener above was live
    await vi.waitFor(async () => {
      await userEvent.keyboard("{Escape}");
      await expect.element(title).not.toBeInTheDocument();
    });
  });
});
