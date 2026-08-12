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
    // the defect this replaces: the click threw, and the donor — who had
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
});
