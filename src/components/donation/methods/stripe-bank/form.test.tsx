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
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

describe("Bank transfer form", () => {
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

    const screen = await render(<Form step="form" type="stripe_bank" />);

    await expect
      .element(screen.getByRole("radio", { name: /give once/i }))
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /give monthly/i }))
      .not.toBeChecked();

    await expect.element(screen.getByRole("combobox")).toHaveValue("USD");
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("");

    await expect
      .element(
        screen.getByRole("switch", { name: /support free fundraising tools/i })
      )
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .toBeChecked();

    await expect
      .element(
        screen.getByRole("switch", {
          name: /cover 3rd party processing fees/i,
        })
      )
      .not.toBeChecked();

    await vi.waitFor(() =>
      expect(
        screen.container.querySelectorAll('[data-testid="incrementer"]').length
      ).toBe(4)
    );

    // no express checkout / paypal
    await expect
      .element(screen.getByText(/express checkout/i))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(/paypal/i)).not.toBeInTheDocument();
  });

  test("submit form with persisted data", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
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

    const screen = await render(
      <Form fv={fv} type="stripe_bank" step="form" />
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveValue(fv.currency.code);
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue(fv.amount);
    await expect
      .element(screen.getByRole("radio", { name: /20%/i }))
      .toBeChecked();

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("empty form validation", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe_bank" />);

    await screen.getByRole("button", { name: /continue/i }).click();

    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();
    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );
  });

  test("correct error and submit", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe_bank" step="form" />);

    await screen.getByRole("button", { name: /continue/i }).click();

    await expect
      .element(screen.getByText(/please enter an amount/i))
      .toBeVisible();
    await vi.waitFor(() =>
      expect(screen.getByPlaceholder(/enter amount/i).element()).toBe(
        document.activeElement
      )
    );

    await screen.getByPlaceholder(/enter amount/i).fill("0.5");
    await screen.getByRole("button", { name: /continue/i }).click();
    await expect.element(screen.getByText(/minimum of/i)).toBeVisible();

    await screen.getByPlaceholder(/enter amount/i).clear();
    await screen.getByPlaceholder(/enter amount/i).fill("2");
    await expect
      .element(screen.getByText(/minimum of/i))
      .not.toBeInTheDocument();

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("user changes currency to CAD, sync filter narrows options, value persists", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form type="stripe_bank" step="form" />);

    await expect.element(screen.getByRole("combobox")).toHaveValue("USD");

    await screen.getByRole("combobox").click();
    // stripe-bank narrows to USD/CAD only — EUR/GBP filtered out at form level
    await expect
      .element(screen.getByRole("option", { name: "CAD" }))
      .toBeVisible();
    expect(screen.getByRole("option", { name: "EUR" }).query()).toBeNull();

    // sync client-side filter via Combobox.useFilter
    await screen.getByRole("combobox").fill("CA");
    await expect
      .element(screen.getByRole("option", { name: "CAD" }))
      .toBeVisible();
    expect(screen.getByRole("option", { name: "USD" }).query()).toBeNull();

    await screen.getByRole("option", { name: "CAD" }).click();
    await expect.element(screen.getByRole("combobox")).toHaveValue("CAD");

    await screen.getByPlaceholder(/enter amount/i).fill("10");
    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("fee info line visible", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe_bank" />);

    await expect
      .element(screen.getByText(/0\.8% fee, capped at \$5/))
      .toBeVisible();
  });
});
