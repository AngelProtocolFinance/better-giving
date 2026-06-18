import { afterAll, describe, expect, test, vi } from "vitest";
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
// mock express buttons — express checkout calls validate() on every click (reject-based),
// paypal uses overlay gate (is_partial-based)
vi.mock("../paypal", () => ({
  Paypal: (props: any) => (
    <div data-testid="paypal-mock">
      {props.is_partial && (
        <button
          type="button"
          data-testid="paypal-gate"
          onClick={() => props.validate()}
        />
      )}
    </div>
  ),
}));
vi.mock("./express-checkout", () => ({
  ExpressCheckout: (props: any) => (
    <button
      type="button"
      data-testid="express-checkout-btn"
      onClick={() => props.validate()}
    />
  ),
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
    //tip enabled by default
    await expect
      .element(
        screen.getByRole("switch", { name: /support free fundraising tools/i })
      )
      .toBeChecked();
    // tip enabled and defaulted to 15%
    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .toBeChecked();

    //fee coverage disabled by default
    await expect
      .element(
        screen.getByRole("switch", {
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
        screen.getByRole("switch", { name: /support free fundraising tools/i })
      )
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /20%/i }))
      .toBeChecked();

    await expect
      .element(
        screen.getByRole("switch", {
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
