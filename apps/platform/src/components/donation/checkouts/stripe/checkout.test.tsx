import type { Stripe, StripeError } from "@stripe/stripe-js";
import { type ReactNode, useEffect } from "react";
import { createRoutesStub } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render } from "vitest-browser-react";
import { don_intents_error_handler } from "#/services/api/mock";
import { mswWorker } from "#/setup-tests-browser";
import type { Config } from "../../types";
import { type StripeDonationDetails, tip_fv_init } from "../../types";
import { StripeCheckout as Checkout } from "./checkout";

// what reached sentry, in order. `error_prompt` funnels everything through
// `report_error`, so this is the only way to tell a paged defect apart from a
// prompt the donor simply reads and corrects.
const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@/errors/report", async (orig) => ({
  ...(await orig<typeof import("@/errors/report")>()),
  report_error: (e: unknown) => {
    reported.push(e);
  },
}));

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

// leaving for the thank-you page is one shared helper with its own tests
// (../../common/redirect.test.ts) — what's asserted here is that a completed
// payment reaches it, and what the donor is shown when it reports back that
// the browser never left.
const redirect_mock = vi.hoisted(() => vi.fn());
vi.mock("../../common/redirect", () => ({
  use_donation_redirect: () => redirect_mock,
}));

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
  afterEach(() => {
    reported.length = 0;
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
    await expect.element(errorModal).toMatchTextContent(/invalid card/i);

    // a wrong cvc is the donor's to fix, not ours. it must not page.
    expect(reported).toHaveLength(0);
  });

  test("a rejected amount is the donor's to fix too", async () => {
    const Stub = stb(<Checkout {...fv} tip_format="20" />);
    const screen = await render(<Stub />);
    const donateBtn = screen.getByRole("button", { name: /donate now/i });
    await expect.element(donateBtn).toBeVisible();

    const err: StripeError = {
      type: "validation_error",
      message: "Amount must be at least $1.00",
    };

    if (fv.frequency === "one-time") {
      confirm_payment_mock.mockResolvedValueOnce({ error: err });
    } else confirm_setup_mock.mockResolvedValueOnce({ error: err });

    await donateBtn.click();
    const errorModal = screen.getByRole("dialog");
    await expect.element(errorModal).toMatchTextContent(/must be at least/i);

    expect(reported).toHaveLength(0);
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
    await expect.element(errorModal).toMatchTextContent(genericError);

    // the other half of the rule — quieting card errors must not quiet these.
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(err);
  });

  test("a completed payment leaves for the thank-you page", async () => {
    const Stub = stb(<Checkout {...fv} amount="101" />);
    const screen = await render(<Stub />);
    const donateBtn = screen.getByRole("button", { name: /donate now/i });
    await expect.element(donateBtn).toBeVisible();

    confirm_payment_mock.mockResolvedValueOnce({});
    await donateBtn.click();

    // the helper owns the iframe/top-level split — this only proves the
    // success branch hands it the donor's receipt url
    await vi.waitFor(() => expect(redirect_mock).toHaveBeenCalledOnce());
    expect(redirect_mock.mock.calls[0]![0]).toMatchObject({
      dest: {
        url: "https://test.example.com/donations/fake_order_id",
        is_custom: false,
      },
    });
  });

  test("a navigation that never lands leaves an answer, not a spinner", async () => {
    // the defect: inside a plain `<iframe src>` nothing ever cleared this and
    // the donor watched "Processing..." forever after a payment that worked.
    redirect_mock.mockImplementationOnce((x: { on_stuck?: () => void }) =>
      x.on_stuck?.()
    );
    const Stub = stb(<Checkout {...fv} amount="102" />);
    const screen = await render(<Stub />);
    const donateBtn = screen.getByRole("button", { name: /donate now/i });
    await expect.element(donateBtn).toBeVisible();

    confirm_payment_mock.mockResolvedValueOnce({});
    await donateBtn.click();

    // told the truth: the money moved, so this is never worded as a failure
    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toMatchTextContent(/donation went through/i);

    // and given the way out, which is the receipt — not the donate button
    const link = screen.getByRole("link", { name: /receipt/i });
    await expect
      .element(link)
      .toHaveAttribute(
        "href",
        "https://test.example.com/donations/fake_order_id"
      );

    // the spinner is gone, and paying again is not what's on offer.
    // (queried off the form, not by role — the open dialog hides everything
    // behind it from the accessibility tree)
    const form = screen
      .getByTestId("stripe-checkout-form")
      .element() as HTMLElement;
    const submit = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    expect(submit?.textContent).not.toMatch(/processing/i);
    expect(submit?.disabled).toBe(true);

    // the donate button never re-opens, so closing the prompt can't be what
    // takes the receipt away with it
    await screen.getByRole("button", { name: /^done$/i }).click();
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog").query()).toBeNull()
    );
    await expect
      .element(screen.getByRole("link", { name: /receipt/i }))
      .toHaveAttribute(
        "href",
        "https://test.example.com/donations/fake_order_id"
      );
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
