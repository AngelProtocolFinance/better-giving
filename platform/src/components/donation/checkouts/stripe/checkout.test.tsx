import type { Stripe, StripeError } from "@stripe/stripe-js";
import { type ReactNode, useEffect } from "react";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { don_intents_error_handler } from "#/services/api/mock";
import { mswWorker } from "#/setup-tests-browser";
import type { Config } from "../../types";
import { type StripeDonationDetails, tip_fv_init } from "../../types";
import { StripeCheckout as Checkout } from "./checkout";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({
  recipient: { id: "1", name: "test", members: [] },
  source: "bg-marketplace",
  mode: "live",
  config: null as Config | null,
  base_url: "https://test.example.com",
  donor: {
    email: "john@doe.com",
    first_name: "John",
    last_name: "Doe",
  },
}));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockReturnValue({ don: don_mock, don_set: don_set_mock }),
}));

const confirm_payment_mock = vi.hoisted(() => vi.fn());
const confirm_setup_mock = vi.hoisted(() => vi.fn());

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: vi.fn(({ children }) => children),
  PaymentElement: vi.fn(({ onReady, onChange }: any) => {
    useEffect(() => {
      onChange({ complete: true });
      const id = setTimeout(onReady, 50);
      return () => {
        clearTimeout(id);
      };
    }, [onReady, onChange]);
    return <div />;
  }),
  useStripe: vi.fn(() => {
    const stripe: Stripe = {
      confirmPayment: confirm_payment_mock,
      confirmSetup: confirm_setup_mock,
    } as any;
    return stripe;
  }),
  useElements: vi.fn(() => ({})),
}));

const stb = (node: ReactNode) =>
  createRoutesStub([{ path: "/", Component: () => node }]);

const fv: StripeDonationDetails = {
  amount: "100",
  currency: { code: "usd", min: 1, rate: 1 },
  frequency: "one-time",
  ...tip_fv_init,
  cover_processing_fee: false,
};

describe("stripe checkout", () => {
  const og_error = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = og_error;
  });

  test("failed to get client secret", async () => {
    // suppress jsdom's reportException noise from error boundary
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("error", stop);
    mswWorker.use(don_intents_error_handler);
    const screen = await render(<Checkout {...fv} />);

    //getting client secret from proxy
    await expect
      .element(screen.getByText(/loading payment form../i))
      .toBeVisible();

    const errorMsg =
      "An unexpected error occurred and has been reported. Please get in touch with hi@better.giving if the problem persists.";
    await expect.element(screen.getByText(errorMsg)).toBeVisible();
    window.removeEventListener("error", stop);
  });

  test("stripe loading", async () => {
    const screen = await render(
      <Checkout {...fv} tip_format="20" /** reset cache */ />
    );

    //getting client secret from proxy
    await expect
      .element(screen.getByText(/loading payment form../i))
      .toBeVisible();
    await expect
      .element(screen.getByTestId("stripe-checkout-form"))
      .toBeVisible();

    //stripe is loading elements
    await expect.element(screen.getByTestId("loader")).toBeVisible();

    await expect
      .element(screen.getByRole("button", { name: /donate now/i }))
      .toBeVisible();
  });

  test("card error", async () => {
    const Stub = stb(<Checkout {...fv} tip_format="20" />);
    const screen = await render(<Stub />);
    const donateBtn = screen.getByRole("button", { name: /donate now/i });
    await expect.element(donateBtn).toBeVisible();

    const err: StripeError = {
      type: "card_error",
      message: "invalid card",
    };

    if (fv.frequency === "one-time") {
      confirm_payment_mock.mockResolvedValueOnce({ error: err });
    } else confirm_setup_mock.mockResolvedValueOnce({ error: err });

    //user sees modal on card error
    await donateBtn.click();
    const errorModal = screen.getByRole("dialog");
    await expect.element(errorModal).toHaveTextContent(/invalid card/i);
  });

  test("unexpected error", async () => {
    const Stub = stb(<Checkout {...fv} tip_format="20" />);
    const screen = await render(<Stub />);
    const donateBtn = screen.getByRole("button", { name: /donate now/i });
    await expect.element(donateBtn).toBeVisible();

    const err: StripeError = {
      type: "idempotency_error",
      message: "unhelpful error message that won't be shown",
    };

    if (fv.frequency === "one-time")
      confirm_payment_mock.mockResolvedValueOnce({ error: err });
    else confirm_setup_mock.mockResolvedValueOnce({ error: err });

    await donateBtn.click();

    const errorModal = screen.getByRole("dialog");
    const genericError =
      "An unexpected error occurred while processing payment and has been reported. Please get in touch with hi@better.giving if the problem persists.";
    await expect.element(errorModal).toHaveTextContent(genericError);
  });

  test("form_id included in intent", async () => {
    don_mock.config = {
      id: "V5K9H2mN3pQx",
      accent_primary: undefined,
      accent_secondary: undefined,
      method_ids: undefined,
      increments: undefined,
      success_redirect: undefined,
      freq_opts: undefined,
      stripe: undefined,
    } satisfies Config;

    try {
      const screen = await render(
        <Checkout {...fv} tip_format="10" /** unique key to bust SWR cache */ />
      );

      // if schema rejects form_id, msw returns 400 → error boundary renders
      await expect
        .element(screen.getByTestId("stripe-checkout-form"))
        .toBeVisible();
    } finally {
      don_mock.config = null;
    }
  });
});
