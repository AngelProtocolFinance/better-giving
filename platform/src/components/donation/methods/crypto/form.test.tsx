import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_tokens } from "#/services/api/mock";
import {
  type CryptoDonationDetails,
  donation_recipient_init,
  type Init,
} from "../../types";
import { Form } from "./form";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} }));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

describe("Crypto form: initial load", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  test("initial form state: no persisted details", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: {
        id: "0",
        name: "",
        members: [],
        donor_address_required: false,
      },
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="crypto" />);

    await expect
      .element(screen.getByPlaceholder(/select token/i))
      .toBeVisible();
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

    // incrementers not shown without selected token
    await vi.waitFor(() =>
      expect(
        screen.container.querySelectorAll('[data-testid="incrementer"]').length
      ).toBe(0)
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

    const fv: CryptoDonationDetails = {
      token: { ...mock_tokens[0], amount: "100", min: 1, usdpu: 1 },
      cover_processing_fee: true,
      tip: "",
      tip_format: "20",
    };

    const screen = await render(<Form fv={fv} type="crypto" step="form" />);

    await expect
      .element(screen.getByPlaceholder(/select token/i))
      .toHaveValue(fv.token.symbol);
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue(fv.token.amount);

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

    // // incrementers not shown without selected token
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

    const screen = await render(<Form step="form" type="crypto" />);

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

    const screen = await render(<Form type="crypto" step="form" />);

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

    //inputs amount but not selected token
    await screen.getByPlaceholder(/enter amount/i).fill("0.5");
    await screen.getByRole("button", { name: /continue/i }).click();

    //inputs amount but not selected token
    await expect.element(screen.getByText(/select token/i)).toBeVisible();

    //user selects token: open, type query → triggers async search, select filtered option
    await screen.getByRole("combobox").click();
    await expect.element(screen.getByRole("option")).toBeVisible();

    await screen.getByRole("combobox").fill("BT");
    await expect
      .element(screen.getByRole("option", { name: /BTC/ }))
      .toBeVisible();
    await screen.getByRole("option", { name: /BTC/ }).click();

    // after select, input reflects the chosen symbol (itemToStringLabel)
    await expect.element(screen.getByRole("combobox")).toHaveValue("BTC");

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
