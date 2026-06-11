import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  donation_recipient_init,
  type Init,
  type StocksDonationDetails,
} from "../../types";
import { Form } from "./form";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} }));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

const mock_ticker = {
  symbol: "AAPL",
  name: "Apple Inc.",
  amount: "10",
  min: 1,
  usdpu: 150,
};

describe("Stocks form: initial load", () => {
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

    const screen = await render(<Form step="form" type="stocks" />);

    await expect
      .element(screen.getByPlaceholder(/select ticker/i))
      .toBeVisible();
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("");
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

    const fv: StocksDonationDetails = {
      ticker: mock_ticker,
      tip: "",
      tip_format: "15",
    };

    const screen = await render(<Form fv={fv} type="stocks" step="form" />);

    await expect
      .element(screen.getByPlaceholder(/select ticker/i))
      .toHaveValue(fv.ticker.symbol);
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue(fv.ticker.amount);

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

    const screen = await render(<Form step="form" type="stocks" />);

    await screen.getByRole("button", { name: /continue/i }).click();

    //amount input required
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

    const screen = await render(<Form type="stocks" step="form" />);

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

    //inputs amount but not selected ticker
    await screen.getByPlaceholder(/enter amount/i).fill("0.5");
    await screen.getByRole("button", { name: /continue/i }).click();

    //ticker not selected
    await expect.element(screen.getByText(/select ticker/i)).toBeVisible();

    //user selects ticker
    await screen.getByRole("combobox").click();
    await expect.element(screen.getByRole("option")).toBeVisible();

    //user clicks first option
    await screen.getByRole("option").first().click();

    // Submit to trigger validation - amount (0.5) is less than min (1)
    await screen.getByRole("button", { name: /continue/i }).click();

    // Should show "minimum of" error since 0.5 < 1
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
  });
});
