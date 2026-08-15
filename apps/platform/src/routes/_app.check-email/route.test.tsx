import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

// the screen is what's under test; its loader/action pull the server auth
// surface in, which has no business in a component test.
vi.mock("./api", () => ({ loader: vi.fn(), action: vi.fn() }));

import { createRoutesStub } from "react-router";
import Page from "./route";

const EMAIL = "lead@example.org";
const REDIRECT = "/register/abc123/2";

async function screen_for(stale: boolean) {
  const Stub = createRoutesStub([
    {
      path: "/check-email",
      Component: Page as any,
      loader: () => ({ email: EMAIL, redirect_to: REDIRECT, stale }),
      action: () => ({ time_remaining: 30 }),
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={["/check-email"]} />);
}

describe("check-email", () => {
  it("throttles the expired-link resend the same as the normal one, and says it sent", async () => {
    const screen = await screen_for(true);

    const btn = screen.getByRole("button", { name: /send a new link/i });
    // nothing was mailed on arrival here — the link they clicked was dead
    await expect.element(btn).toBeEnabled();

    await btn.click();

    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(btn).toBeDisabled();
    await expect.element(screen.getByText(/request another in/i)).toBeVisible();
  });

  it("shows the address in full and offers a way out of a typo", async () => {
    const screen = await screen_for(false);

    await expect.element(screen.getByText(EMAIL)).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /wrong address/i }))
      .toHaveAttribute("href", "/signup");
  });
});
