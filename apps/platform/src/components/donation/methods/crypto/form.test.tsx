import { HttpResponse, http } from "msw";
import { href } from "react-router";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_tokens } from "#/services/api/mock";
import { mswWorker } from "#/setup-tests-browser";
import {
  type CryptoDonationDetails,
  donation_recipient_init,
  type Init,
  tip_val,
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

  test("persisted details rehydrate the token and the fee toggle", async () => {
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
      .element(
        screen.getByRole("checkbox", {
          name: /cover 3rd party processing fees/i,
        })
      )
      .toBeChecked();

    await vi.waitFor(() =>
      expect(
        screen.container.querySelectorAll('[data-testid="incrementer"]').length
      ).toBe(4)
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

  test("turning the tip on submits a state that derives the tip", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;
    don_set_mock.mockReset();

    const fv: CryptoDonationDetails = {
      token: { ...mock_tokens[0], amount: "100", min: 1, usdpu: 1 },
      cover_processing_fee: false,
      tip: "",
      tip_format: "none",
    };

    const screen = await render(<Form fv={fv} type="crypto" step="form" />);

    // native click on the switch's hidden input — the visible control sits
    // below the fold of the form's own scroll container, which playwright's
    // actionability check won't resolve
    const sw = screen.getByRole("checkbox", {
      name: /support free fundraising tools/i,
    });
    (sw.element() as HTMLInputElement).click();

    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .toBeChecked();

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());

    // the format carries the choice, `tip` stays empty, and the charge derives
    const next = don_set_mock.mock.calls[0]![0]({});
    const submitted: CryptoDonationDetails = next.crypto.fv;
    expect(submitted.tip_format).toBe("15");
    expect(submitted.tip).toBe("");
    expect(
      tip_val(submitted.tip_format, submitted.tip, +submitted.token.amount)
    ).toBe(15);
  });
});

const estimate_url = href("/api/tokens/:code/estimate", { code: ":code" });

// a held estimate is released after each test, so a failed assertion can't
// leave its request pending into the next one
let release_estimate = () => {};
afterEach(() => release_estimate());

function hold_estimate(reply: () => Response) {
  const gate = new Promise<void>((r) => {
    release_estimate = r;
  });
  mswWorker.use(
    http.get(estimate_url, async () => {
      await gate;
      return reply();
    })
  );
}

const live_init = (): Init => ({
  base_url: "",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
});

const estimate_ok = () => HttpResponse.json({ min: 1, usdpu: 2 });

async function pick_btc(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole("combobox").click();
  await screen.getByRole("combobox").fill("BT");
  await screen.getByRole("option", { name: /BTC/ }).click();
}

describe("Crypto form: price estimate after a token pick", () => {
  test("an amount typed while the estimate is pending survives its resolve", async () => {
    don_mock.value = live_init();
    hold_estimate(estimate_ok);

    const screen = await render(<Form type="crypto" step="form" />);
    await pick_btc(screen);

    await expect.element(screen.getByRole("combobox")).toBeDisabled();
    await screen.getByPlaceholder(/enter amount/i).fill("5");
    expect(screen.getByText("~$").query()).toBeNull();

    release_estimate();

    await expect.element(screen.getByRole("combobox")).toBeEnabled();
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("5");
    await expect.element(screen.getByText("~$10")).toBeVisible();
  });

  test("a failed estimate clears the pick, and picking the same token again retries", async () => {
    don_mock.value = live_init();
    const failed_msg =
      "Couldn't get a price for this token. Pick it again or choose another.";
    hold_estimate(() => new HttpResponse(null, { status: 500 }));

    const screen = await render(<Form type="crypto" step="form" />);
    await pick_btc(screen);
    await screen.getByPlaceholder(/enter amount/i).fill("5");
    expect(screen.getByText(failed_msg).query()).toBeNull();

    release_estimate();

    await expect.element(screen.getByText(failed_msg)).toBeVisible();
    await expect.element(screen.getByRole("combobox")).toHaveValue("");
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("5");
    expect(screen.getByText("~$").query()).toBeNull();

    hold_estimate(estimate_ok);
    await pick_btc(screen);
    await expect.element(screen.getByText(failed_msg)).not.toBeInTheDocument();
    release_estimate();

    await expect.element(screen.getByRole("combobox")).toHaveValue("BTC");
    await expect.element(screen.getByText("~$10")).toBeVisible();
  });
});
