import { AskHost } from "@better-giving/ui";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

// --- mocks (hoisted) ---

// the stub supplies the action, so no query runs here — the proxy exists to
// keep the real neon client out of the bundle
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("no query is expected on this path");
      },
    }
  ),
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: true,
    user_ctx: true,
  })
);

// the page hands `BankDetails` an `onSubmit` and owns no error surface of its
// own — the wiring under test is what the page does with the result, so the
// form itself stands in as a button that fires the callback.
vi.mock("#/components/bank-details", () => ({
  BankDetails: ({ onSubmit, is_loading }: any) => (
    <button
      type="button"
      disabled={is_loading}
      onClick={() =>
        onSubmit(
          { id: 999, currency: "usd", details: { accountNumber: "12345678" } },
          "https://example.com/bank.pdf"
        )
      }
    >
      submit bank details
    </button>
  ),
}));

// --- imports (after mocks hoisted) ---

import { resp } from "@/helpers/https";
import Payout from "./route";

beforeEach(async () => {
  await cleanup();
});

function render_payout(action: () => Response) {
  const Stub = createRoutesStub([
    {
      path: "/dashboard/referrals/payout",
      // the failure prompt is raised through `ask`, which mounts at `AskHost`
      Component: () => (
        <>
          <Payout />
          <AskHost />
        </>
      ),
      HydrateFallback: () => null,
      action,
    },
    { path: "/dashboard/referrals", Component: () => <p>referrals</p> },
  ]);
  return render(<Stub initialEntries={["/dashboard/referrals/payout"]} />);
}

describe("referrals payout", () => {
  it("surfaces the failure when the save is rejected", async () => {
    const screen = await render_payout(() =>
      resp.fail(400, "wise recipient not found")
    );

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    await expect
      .element(screen.getByText(/wise recipient not found/i))
      .toBeInTheDocument();
  }, 30_000);

  it("falls back to the generic line when the failure is ours", async () => {
    // the shape the real action returns when the write fails
    const screen = await render_payout(() =>
      resp.fail(500, "Could not save your payout account")
    );

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    // a 5xx is ours: the user gets the generic line and it is reported
    await expect
      .element(screen.getByText(/while saving your payout account/i))
      .toBeInTheDocument();
  }, 30_000);
});
