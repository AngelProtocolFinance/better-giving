import { HttpResponse, http } from "msw";
import { href } from "react-router";
import { SWRConfig } from "swr";
import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_usd } from "#/services/api/mock";
import { mswWorker } from "#/setup-tests-browser";
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
        screen.getByRole("checkbox", {
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

  test("currencies that fail to load still offer USD", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;
    mswWorker.use(
      http.get(href("/api/currencies"), () =>
        HttpResponse.text("Too many requests", { status: 429 })
      )
    );

    // a selection is always kept in the list, so a persisted non-USD one is
    // what shows whether USD is offered beside it
    const fv: StripeDonationDetails = {
      amount: "100",
      currency: { code: "CAD", rate: 1.37, min: 1.37 },
      frequency: "one-time",
      cover_processing_fee: false,
      tip: "",
      tip_format: "none",
    };

    // fresh cache: an earlier test's cached currencies would skip the request
    const screen = await render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Form fv={fv} step="form" type="stripe_bank" />
      </SWRConfig>
    );

    await expect.element(screen.getByRole("combobox")).toHaveValue("CAD");
    // via ark's trigger: it sits over the input and would intercept a click there
    await screen.getByRole("button", { name: "Toggle suggestions" }).click();
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();

    // the fallback is the way forward, so the donor can still continue
    await screen.getByRole("option", { name: "USD" }).click();
    await expect.element(screen.getByRole("combobox")).toHaveValue("USD");
    await screen.getByPlaceholder(/enter amount/i).fill("10");
    const cont = screen.getByRole("button", { name: /continue/i });
    await expect.element(cont).toBeEnabled();
    await cont.click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
    don_set_mock.mockReset();
  });

  test("currencies that fail to load are not re-requested", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;
    // a retry re-asks an endpoint that is already refusing
    let calls = 0;
    mswWorker.use(
      http.get(href("/api/currencies"), () => {
        calls++;
        return HttpResponse.text("Too many requests", { status: 429 });
      })
    );

    // fast retry interval so a retry, if one were allowed, lands in the test
    await render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          errorRetryInterval: 10,
          dedupingInterval: 0,
        }}
      >
        <Form step="form" type="stripe_bank" />
      </SWRConfig>
    );

    await vi.waitFor(() => expect(calls).toBe(1));
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBe(1);
  });

  test("persisted details rehydrate the currency", async () => {
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

    // via ark's trigger: it sits over the input and would intercept a click there
    await screen.getByRole("button", { name: "Toggle suggestions" }).click();
    // stripe-bank narrows to USD/CAD only — EUR/GBP filtered out at form level
    await expect
      .element(screen.getByRole("option", { name: "CAD" }))
      .toBeVisible();
    expect(screen.getByRole("option", { name: "EUR" }).query()).toBeNull();

    // the seam's client-side filter narrows to CAD, and the selected USD is
    // rehydrated alongside it — a selection the query drops has no label left
    // for the input to fall back to (`internal/use-collection`)
    await screen.getByRole("combobox").fill("CA");
    await expect
      .element(screen.getByRole("option", { name: "CAD" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();

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
