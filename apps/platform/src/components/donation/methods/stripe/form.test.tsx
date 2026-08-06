import { type ReactNode, useEffect } from "react";
import { createRoutesStub } from "react-router";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_usd } from "#/services/api/mock";
import {
  donation_recipient_init,
  type Init,
  type StripeDonationDetails,
} from "../../types";
import { Form } from "./form";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} }));
// a rail that reports itself unavailable on every mount — an adblocked sdk
// fails identically each time it's retried. the buttons below drive the
// one-shot cases; these flags drive the persistent one.
const rails = vi.hoisted(() => ({ pp_out: false, sx_out: false }));
// mock express buttons — express checkout calls validate() on every click (reject-based),
// paypal uses overlay gate (is_partial-based)
vi.mock("../paypal", () => ({
  Paypal: (props: any) => {
    // a rail reports itself unavailable once per mount, not once per render
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
    useEffect(() => {
      if (rails.pp_out) props.on_unavailable?.("paypal is out");
    }, []);
    return (
      <div data-testid="paypal-mock">
        {props.is_partial && (
          <button
            type="button"
            data-testid="paypal-gate"
            onClick={() => props.validate()}
          />
        )}
        {/* the rail's own failure classification, driven from the test */}
        <button
          type="button"
          data-testid="paypal-unavailable"
          onClick={() => props.on_unavailable?.("paypal is out")}
        />
        <button
          type="button"
          data-testid="paypal-error"
          onClick={() => props.on_error(<p>paypal died mid-payment</p>)}
        />
      </div>
    );
  },
}));
vi.mock("./express-checkout", () => ({
  ExpressCheckout: (props: any) => {
    // a rail reports itself unavailable once per mount, not once per render
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
    useEffect(() => {
      if (rails.sx_out) props.on_unavailable?.("express is out");
    }, []);
    return (
      <div data-testid="express-mock">
        <button
          type="button"
          data-testid="express-checkout-btn"
          onClick={() => props.validate()}
        />
        <button
          type="button"
          data-testid="express-unavailable"
          onClick={() => props.on_unavailable?.("express is out")}
        />
        <button
          type="button"
          data-testid="express-error"
          onClick={() => props.on_error("your card was declined")}
        />
      </div>
    );
  },
}));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

describe("Stripe form: initial load", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  test("initial form state: no persisted details", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe" />);

    // frequency selector defaults to one-time
    await expect
      .element(screen.getByRole("radio", { name: /give once/i }))
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /give monthly/i }))
      .not.toBeChecked();

    // currency selector loads at the beginning with USD default
    await expect.element(screen.getByRole("combobox")).toHaveValue("USD");
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("");
    //tip disabled by default — no preselection (ncn compliance)
    await expect
      .element(
        screen.getByRole("checkbox", {
          name: /support free fundraising tools/i,
        })
      )
      .not.toBeChecked();
    // no tip percent preselected on load
    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .not.toBeChecked();

    //fee coverage disabled by default
    await expect
      .element(
        screen.getByRole("checkbox", {
          name: /cover 3rd party processing fees/i,
        })
      )
      .not.toBeChecked();

    // incrementers shown since currency loads at the beginning
    await vi.waitFor(() =>
      expect(
        screen.container.querySelectorAll('[data-testid="incrementer"]').length
      ).toBe(4)
    );
  });

  test("submit form with initial/persisted data", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
      user: { email: "john@doe.com", first_name: "John", last_name: "Doe" },
    };
    don_mock.value = init;

    const fv: StripeDonationDetails = {
      amount: "100",
      currency: mock_usd,
      frequency: "one-time",
      cover_processing_fee: true,
      tip: "",
      tip_format: "20",
    };

    const screen = await render(<Form fv={fv} type="stripe" step="form" />);

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveValue(fv.currency.code);
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue(fv.amount);

    await expect
      .element(
        screen.getByRole("checkbox", {
          name: /support free fundraising tools/i,
        })
      )
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /20%/i }))
      .toBeChecked();

    await expect
      .element(
        screen.getByRole("checkbox", {
          name: /cover 3rd party processing fees/i,
        })
      )
      .toBeChecked();

    // incrementers shown since currency loads at the beginning
    await vi.waitFor(() =>
      expect(
        screen.container.querySelectorAll('[data-testid="incrementer"]').length
      ).toBe(4)
    );

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("submitting empty form should show validation messages and focus first field: amount input", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe" />);

    await screen.getByRole("button", { name: /continue/i }).click();

    //amount input
    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();

    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );
  });

  test("user corrects error and submits", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe" step="form" />);

    //submit empty form
    await screen.getByRole("button", { name: /continue/i }).click();

    //amount input required and focused
    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();
    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );

    //inputs amount below minimum
    await screen.getByPlaceholder(/enter amount/i).fill("0.5");
    await screen.getByRole("button", { name: /continue/i }).click();

    //shows minimum validation error
    await expect.element(screen.getByText(/minimum of/i)).toBeVisible();

    //user now inputs amount greater than minimum
    await screen.getByPlaceholder(/enter amount/i).clear();
    await screen.getByPlaceholder(/enter amount/i).fill("2");
    await expect
      .element(screen.getByText(/minimum of/i))
      .not.toBeInTheDocument();

    //user submits form and moves to donor step
    await screen.getByRole("button", { name: /continue/i }).click();

    //form submitted successfully, navigates to donor step
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("clicking express checkout with empty amount shows validation error and focuses amount", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe" />);

    await screen.getByTestId("express-checkout-btn").click();

    // validation error shown
    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();

    // amount input focused
    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );
  });

  test("clicking paypal gate with empty amount shows validation error and focuses amount", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe" />);

    await expect.element(screen.getByTestId("paypal-gate")).toBeInTheDocument();

    await screen.getByTestId("paypal-gate").click();

    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();

    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );
  });

  test("user changes currency to EUR, sync filter narrows options, value persists", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe" step="form" />);

    // currency loads USD by default
    await expect.element(screen.getByRole("combobox")).toHaveValue("USD");

    // open currency selector — all 3 currencies visible
    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();

    // type "EU" → sync client-side filter via Combobox.useFilter, USD drops out
    await screen.getByRole("combobox").fill("EU");
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();
    expect(screen.getByRole("option", { name: "USD" }).query()).toBeNull();

    // select EUR → input syncs to itemToStringLabel
    await screen.getByRole("option", { name: "EUR" }).click();
    await expect.element(screen.getByRole("combobox")).toHaveValue("EUR");

    // fill amount, submit, assert form fires with EUR currency
    await screen.getByPlaceholder(/enter amount/i).fill("10");
    await screen.getByRole("button", { name: /continue/i }).click();

    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("clicking a tip percent radio does not trigger amount-input focus styling", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe" step="form" />);

    // baseline: no tip percent preselected on load
    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .not.toBeChecked();

    // click a different percent via its label text — focus goes to the
    // radio's hidden input, NOT to a text/number input that would highlight
    // the row's bottom border.
    await screen.getByText("20%").click();
    await expect
      .element(screen.getByRole("radio", { name: /20%/i }))
      .toBeChecked();

    // active element must be a radio input (not text/number)
    const active = document.activeElement as HTMLInputElement | null;
    expect(active?.tagName).toBe("INPUT");
    expect(active?.type).toBe("radio");
  });

  test("user selects frequency and submits", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe" step="form" />);

    // verify frequency defaults to one-time
    await expect
      .element(screen.getByRole("radio", { name: /give once/i }))
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /give monthly/i }))
      .not.toBeChecked();

    // user fills in amount
    await screen.getByPlaceholder(/enter amount/i).fill("50");

    // user submits form and moves to donor step
    await screen.getByRole("button", { name: /continue/i }).click();

    //form submitted successfully, navigates to donor step
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });
});

// <Prompt> reaches for useNavigate, so anything that surfaces one needs a router
const stb = (node: ReactNode) =>
  createRoutesStub([
    { path: "/", Component: () => node, HydrateFallback: () => null },
  ]);

const init = (over?: Partial<Init>): Init => ({
  base_url: "",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
  ...over,
});

// the donor can still work the form: nothing is inerted or hidden behind a
// modal, and a submit still reaches don_set.
const assert_form_live = async (
  screen: Awaited<ReturnType<typeof render>>
): Promise<void> => {
  expect(screen.getByRole("dialog").query()).toBeNull();
  const cont = screen.getByRole("button", { name: /continue with card/i });
  await expect.element(cont).toBeVisible();
  const el = cont.element();
  expect(el.closest("[inert]")).toBeNull();
  expect(el.closest('[aria-hidden="true"]')).toBeNull();

  await screen.getByPlaceholder(/enter amount/i).fill("25");
  await cont.click();
  await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
  don_set_mock.mockReset();
};

describe("Stripe form: an express rail that can't be offered", () => {
  afterEach(() => {
    rails.pp_out = false;
    rails.sx_out = false;
    don_set_mock.mockReset();
  });

  test("a hide_unavailable_express mount drops the block and prompts nothing", async () => {
    don_mock.value = init({ hide_unavailable_express: true });
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await expect.element(screen.getByTestId("express-mock")).toBeVisible();
    await screen.getByTestId("express-unavailable").click();

    await expect
      .element(screen.getByTestId("express-mock"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("express is out"))
      .not.toBeInTheDocument();
    // the rest of the form is untouched — the absence above isn't a blank panel
    await expect
      .element(screen.getByRole("button", { name: /continue with card/i }))
      .toBeVisible();
    expect(screen.getByRole("dialog").query()).toBeNull();
  });

  test("a mount without the flag says why in place of the block, not in a modal", async () => {
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-unavailable").click();

    // the message lands where the block was...
    await expect.element(screen.getByText("express is out")).toBeVisible();
    await expect
      .element(screen.getByTestId("express-mock"))
      .not.toBeInTheDocument();
    // ...and the donor can carry on
    await assert_form_live(screen);
  });

  test("a failure that repeats on every mount notices once, with nothing to dismiss", async () => {
    // the defect this replaces: a modal unmounted the rail, closing it
    // remounted the rail, the rail failed the same way and re-prompted — on
    // /donate/:id the donor could never reach the other tabs.
    rails.sx_out = true;
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await expect.element(screen.getByText("express is out")).toBeVisible();
    await expect
      .element(screen.getByTestId("express-mock"))
      .not.toBeInTheDocument();
    // settles there — no modal on this mount or any remount it would cause
    await new Promise((r) => setTimeout(r, 150));
    await expect.element(screen.getByText("express is out")).toBeVisible();
    await assert_form_live(screen);
  });

  test("an in-flight payment error prompts even on a mount that degrades quietly", async () => {
    don_mock.value = init({ hide_unavailable_express: true });
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-error").click();

    await expect
      .element(screen.getByText("your card was declined"))
      .toBeVisible();
    // a real modal, not a line of text the donor can scroll past: the donor
    // authorized a payment in the wallet sheet and it died — they must be told
    await expect.element(screen.getByRole("dialog")).toBeVisible();
  });

  test("an in-flight paypal error prompts on the mount that shows notices too", async () => {
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("paypal-error").click();

    await expect
      .element(screen.getByText("paypal died mid-payment"))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
  });

  test("re-offers the block when the donor changes the flow shape", async () => {
    don_mock.value = init({ hide_unavailable_express: true });
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-unavailable").click();
    await expect
      .element(screen.getByTestId("express-mock"))
      .not.toBeInTheDocument();

    // monthly is a different flow shape — what's ineligible for one-time may
    // be fine here, so the rail gets another chance rather than staying hidden
    // the ark radio input sits offscreen behind its label — click it natively
    (
      screen
        .getByRole("radio", { name: /give monthly/i })
        .element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByRole("radio", { name: /give monthly/i }))
      .toBeChecked();
    await expect.element(screen.getByTestId("express-mock")).toBeVisible();
  });

  test("a currency change clears the notice and re-offers the block", async () => {
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-unavailable").click();
    await expect.element(screen.getByText("express is out")).toBeVisible();

    await screen.getByRole("combobox").click();
    await screen.getByRole("option", { name: "EUR" }).click();
    await expect.element(screen.getByRole("combobox")).toHaveValue("EUR");

    await expect
      .element(screen.getByText("express is out"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByTestId("express-mock")).toBeVisible();
  });
});

describe("Stripe form: the two express rails degrade independently", () => {
  afterEach(() => {
    rails.pp_out = false;
    rails.sx_out = false;
  });

  const hide = init({ hide_unavailable_express: true });

  test("stripe going quiet leaves paypal's block up", async () => {
    don_mock.value = hide;
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-unavailable").click();

    await expect
      .element(screen.getByTestId("express-mock"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByTestId("paypal-mock")).toBeVisible();
  });

  test("paypal going quiet leaves stripe's block up", async () => {
    don_mock.value = hide;
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("paypal-unavailable").click();

    await expect
      .element(screen.getByTestId("paypal-mock"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByTestId("express-mock")).toBeVisible();
  });

  test("stripe's notice leaves paypal's block up", async () => {
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("express-unavailable").click();

    await expect.element(screen.getByText("express is out")).toBeVisible();
    await expect.element(screen.getByTestId("paypal-mock")).toBeVisible();
    await expect
      .element(screen.getByText("paypal is out"))
      .not.toBeInTheDocument();
  });

  test("paypal's notice leaves stripe's block up", async () => {
    don_mock.value = init();
    const Stub = stb(<Form step="form" type="stripe" />);
    const screen = await render(<Stub />);

    await screen.getByTestId("paypal-unavailable").click();

    await expect.element(screen.getByText("paypal is out")).toBeVisible();
    await expect.element(screen.getByTestId("express-mock")).toBeVisible();
    await expect
      .element(screen.getByText("express is out"))
      .not.toBeInTheDocument();
  });
});
