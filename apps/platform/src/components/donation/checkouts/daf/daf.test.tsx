import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { createRoutesStub, href } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type { Config, DafDonationDetails } from "../../types";
import { ChariotCheckout } from ".";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({
  recipient: { id: "1", name: "test", members: [] },
  source: "bg-marketplace",
  mode: "live",
  config: null as Config | null,
  base_url: "https://test.example.com",
}));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockReturnValue({ don: don_mock, don_set: don_set_mock }),
}));

// leaving for the thank-you page is one shared helper with its own tests
// (../../common/redirect.test.ts) — what's asserted here is what the donor is
// left looking at when it reports back that the browser never left.
const redirect_mock = vi.hoisted(() => vi.fn());
vi.mock("../../common/redirect", () => ({
  use_donation_redirect: () => redirect_mock,
}));

const CDN_SRC = "https://cdn.givechariot.com/chariot-connect.umd.js";

const fv: DafDonationDetails = {
  amount: "100",
  tip: "",
  tip_format: "none",
  cover_processing_fee: false,
};

/** what chariot hands back on CHARIOT_SUCCESS — a grant that has already been
 * recommended, in cents, with the donor's details off their daf account. */
const success_detail = {
  workflowSessionId: "ws_1",
  grantIntent: {
    amount: 10_000,
    metadata: {
      don_id: "11111111-1111-4111-8111-111111111111",
      amount: { base: 100, tip: 0, fee_allowance: 0 },
    },
  },
  user: {
    firstName: "John",
    lastName: "Doe",
    email: "john@doe.com",
    address: {
      line1: "1 Main St",
      line2: "",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    },
  },
};

const stb = (node: ReactNode) =>
  createRoutesStub([
    { path: "/", Component: () => node, HydrateFallback: () => null },
  ]);

describe("daf checkout: a grant that goes through but never lands", () => {
  afterEach(() => {
    redirect_mock.mockReset();
    for (const s of document.querySelectorAll(`script[src="${CDN_SRC}"]`)) {
      s.remove();
    }
  });

  /** the panel waits on chariot's cdn script. seeding a tag it already
   * recognizes skips the load entirely — `type` keeps the browser from
   * fetching a src it can't execute, so no test ever reaches the network. */
  const seed_script = () => {
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);
  };

  test("the way to the receipt outlives the modal, and the widget stays up", async () => {
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.json({ id: "don_1" })
      )
    );
    redirect_mock.mockImplementation((x: { on_stuck?: () => void }) =>
      x.on_stuck?.()
    );
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );

    // told the truth: the grant moved, so this is never worded as a failure
    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toHaveTextContent(/donation went through/i);

    // dismissing it can't be what takes the receipt away: the donor keeps
    // reading "your donation went through" on the panel itself.
    await screen.getByRole("button", { name: /^done$/i }).click();
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog").query()).toBeNull()
    );
    await expect
      .element(screen.getByText(/donation went through/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /receipt/i }))
      .toHaveAttribute("href", "https://test.example.com/donations/don_1");

    // never unmounted from under the donor: it owns an out-of-page session
    const el2 = screen.container.querySelector("chariot-connect");
    expect(el2).not.toBeNull();
    // ...but it can't be launched again. the grant is already recommended;
    // a second one spends the donor's fund twice.
    expect(el2!.closest("[inert]")).not.toBeNull();
  });
});
