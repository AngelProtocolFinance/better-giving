import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  donation_recipient_init,
  type Init,
  type IraQcdDonationDetails,
} from "../../types";
import { Form } from "./form";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} }));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

describe("IRA/QCD form: initial load", () => {
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

    const screen = await render(<Form step="form" type="ira_qcd" />);

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("");

    await expect
      .element(screen.getByPlaceholder(/e\.g\. Fidelity, Schwab, Vanguard/i))
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

    // no cover_processing_fee switch for ira/qcd
    await expect
      .element(
        screen.getByRole("switch", {
          name: /cover 3rd party processing fees/i,
        })
      )
      .not.toBeInTheDocument();

    // incrementers shown
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
    };
    don_mock.value = init;

    const fv: IraQcdDonationDetails = {
      amount: "100",
      tip: "",
      tip_format: "20",
      custodian: "Fidelity",
    };

    const screen = await render(<Form fv={fv} type="ira_qcd" step="form" />);

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("100");

    await expect
      .element(screen.getByPlaceholder(/e\.g\. Fidelity, Schwab, Vanguard/i))
      .toHaveValue("Fidelity");

    await expect
      .element(
        screen.getByRole("switch", { name: /support free fundraising tools/i })
      )
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /20%/i }))
      .toBeChecked();

    // incrementers shown
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

    const screen = await render(<Form step="form" type="ira_qcd" />);

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

    const screen = await render(<Form type="ira_qcd" step="form" />);

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

    //user inputs valid amount
    await screen.getByPlaceholder(/enter amount/i).fill("50");
    await expect
      .element(screen.getByText(/please enter an amount/i))
      .not.toBeInTheDocument();

    await screen.getByRole("button", { name: /continue/i }).click();

    //form submitted successfully
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });
});
