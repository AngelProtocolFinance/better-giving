import { HttpResponse, http } from "msw";
import { href } from "react-router";
import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
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

  test("persisted details rehydrate the ticker", async () => {
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

    //user selects ticker: open, type query → triggers async search, select filtered option
    await screen.getByRole("combobox").click();
    await expect.element(screen.getByRole("option")).toBeVisible();

    await screen.getByRole("combobox").fill("AAP");
    await expect
      .element(screen.getByRole("option", { name: /AAPL/ }))
      .toBeVisible();
    await screen.getByRole("option", { name: /AAPL/ }).click();

    // after select, input reflects the chosen symbol (itemToStringLabel)
    await expect.element(screen.getByRole("combobox")).toHaveValue("AAPL");

    // submit to trigger validation - amount (0.5) is less than min (1)
    await screen.getByRole("button", { name: /continue/i }).click();

    // should show "minimum of" error since 0.5 < 1
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

const estimate_url = href("/api/tickers/:symbol/estimate", {
  symbol: ":symbol",
});

const live_init = (): Init => ({
  base_url: "",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
});

async function pick_aapl(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole("combobox").click();
  await screen.getByRole("combobox").fill("AAP");
  await screen.getByRole("option", { name: /AAPL/ }).click();
}

describe("Stocks form: price estimate after a ticker pick", () => {
  test("an amount typed while the estimate is pending survives its resolve", async () => {
    don_mock.value = live_init();
    let open_gate = () => {};
    const gate = new Promise<void>((r) => {
      open_gate = r;
    });
    mswWorker.use(
      http.get(estimate_url, async () => {
        await gate;
        return HttpResponse.json({ min: 1, usdpu: 150 });
      })
    );

    const screen = await render(<Form type="stocks" step="form" />);
    await pick_aapl(screen);

    // combobox is locked while the estimate is in flight; the amount is not
    await expect.element(screen.getByRole("combobox")).toBeDisabled();
    await screen.getByPlaceholder(/enter amount/i).fill("5");

    open_gate();

    await expect.element(screen.getByRole("combobox")).toBeEnabled();
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("5");
    // the estimate's fields still landed
    await expect.element(screen.getByText("~$750")).toBeVisible();
  });

  test("Continue during a pending estimate says the price is still coming", async () => {
    don_mock.value = live_init();
    don_set_mock.mockClear();
    let open_gate = () => {};
    const gate = new Promise<void>((r) => {
      open_gate = r;
    });
    mswWorker.use(
      http.get(estimate_url, async () => {
        await gate;
        return HttpResponse.json({ min: 1, usdpu: 150 });
      })
    );

    const screen = await render(<Form type="stocks" step="form" />);
    await pick_aapl(screen);
    await expect.element(screen.getByRole("combobox")).toBeDisabled();
    await screen.getByPlaceholder(/enter amount/i).fill("5");
    await screen.getByRole("button", { name: /continue/i }).click();

    await expect
      .element(
        screen.getByText(
          "Getting a price for this stock — try again in a moment."
        )
      )
      .toBeVisible();
    expect(don_set_mock).not.toHaveBeenCalled();
    open_gate();
  });

  test("a failed estimate tells the donor why Continue does nothing", async () => {
    don_mock.value = live_init();
    don_set_mock.mockClear();
    mswWorker.use(
      http.get(estimate_url, () => new HttpResponse(null, { status: 500 }))
    );

    const screen = await render(<Form type="stocks" step="form" />);
    await pick_aapl(screen);
    await screen.getByPlaceholder(/enter amount/i).fill("5");
    await screen.getByRole("button", { name: /continue/i }).click();

    await expect
      .element(
        screen.getByText(
          "Couldn't get a price for this stock. Try again or pick another."
        )
      )
      .toBeVisible();
    expect(don_set_mock).not.toHaveBeenCalled();
  });
});
