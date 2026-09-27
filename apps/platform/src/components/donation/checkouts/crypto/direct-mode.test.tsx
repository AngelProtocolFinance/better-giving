import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { createRoutesStub, href } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import { donor_fv_blank } from "@/donations/schema";
import { donation_recipient_init, type Init } from "../../types";
import { DirectMode } from "./direct-mode";

const redirect_mock = vi.hoisted(() => vi.fn());
vi.mock("../../common/redirect", () => ({
  use_donation_redirect: () => redirect_mock,
}));

const init = (): Init => ({
  base_url: "https://test.example.com",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
});

const fv = {
  token: {
    id: "1",
    amount: "0.5",
    name: "Bitcoin",
    code: "BTC",
    min: 0,
    usdpu: 60_000,
    logo: "/images/coins/btc.svg",
    precision: 8,
    network: "btc",
    cg_id: "bitcoin",
    color: "#f6931a",
    symbol: "BTC",
  },
  tip: "",
  tip_format: "none" as const,
  cover_processing_fee: false,
};

// the intent route validates for real (msw runs the valibot schema), and an
// email is the one donor field it insists on
const donor = {
  ...donor_fv_blank,
  first_name: "John",
  last_name: "Doe",
  email: "john@doe.com",
};

const stb = (node: ReactNode) =>
  createRoutesStub([
    { path: "/", Component: () => node, HydrateFallback: () => null },
  ]);

describe("crypto direct mode: the donor says they've paid", () => {
  afterEach(() => {
    redirect_mock.mockReset();
  });

  test("confirming takes them to the receipt", async () => {
    const Stub = stb(
      <DirectMode
        fv={fv}
        init={init()}
        donor={donor}
        fee_allowance={0}
        tipv={0}
      />
    );
    const screen = await render(<Stub />);

    const btn = screen.getByRole("button", { name: /completed the payment/i });
    await expect.element(btn).toBeEnabled();
    await btn.click();

    await vi.waitFor(() => expect(redirect_mock).toHaveBeenCalledOnce());
    expect(redirect_mock.mock.calls[0]![0]).toMatchObject({
      dest: {
        url: "https://test.example.com/donations/fake_order_id",
        is_custom: false,
      },
    });
  });

  test("an order that never arrived leaves nothing to press", async () => {
    // the defect this guards against: the click threw, and the donor — who had
    // already sent crypto — got an error boundary instead of the address.
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.json({ address: "fake_address" })
      )
    );

    const Stub = stb(
      <DirectMode
        fv={{ ...fv, token: { ...fv.token, amount: "0.6" } }}
        init={init()}
        donor={donor_fv_blank}
        fee_allowance={0}
        tipv={0}
      />
    );
    const screen = await render(<Stub />);

    const btn = screen.getByRole("button", { name: /completed the payment/i });
    await expect.element(btn).toBeDisabled();
    expect(redirect_mock).not.toHaveBeenCalled();
  });

  test("the amount to send is the one nowpayments will expect, not the form's own sum", async () => {
    // pay_amount is price_amount reconverted at nowpayments' rate, so it drifts
    // from base + tip + fee_allowance; sending the form's figure underpays
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.json({
          id: 123,
          order_id: "fake_order_id",
          address: "fake_address",
          amount: 0.81234567,
          // differs from the token's 60_000, so the decimals follow the server
          usdpu: 600,
          currency: "BTC",
          description: "donation",
        })
      )
    );

    const Stub = stb(
      <DirectMode
        fv={{ ...fv, token: { ...fv.token, amount: "0.8" } }}
        init={init()}
        donor={donor}
        fee_allowance={0}
        tipv={0}
      />
    );
    const screen = await render(<Stub />);

    // rounded up at the server's display precision, so the donor never sends
    // less than pay_amount
    await expect.element(screen.getByText(/send 0\.8124\s+BTC/)).toBeVisible();
    expect(screen.getByText(/send 0\.80+\s/).query()).toBeNull();
  });

  test("a server failure shows the generic message, not a blank frame", async () => {
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.text("boom", { status: 500 })
      )
    );

    const Stub = stb(
      <DirectMode
        fv={{ ...fv, token: { ...fv.token, amount: "0.7" } }}
        init={init()}
        donor={donor}
        fee_allowance={0}
        tipv={0}
      />
    );
    const screen = await render(<Stub />);

    // a 5xx body is a framework error page, so the donor gets the fallback —
    // never the server's own text
    await expect
      .element(screen.getByText(/failed to load donation address/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /completed the payment/i }))
      .toBeDisabled();
  });
});
