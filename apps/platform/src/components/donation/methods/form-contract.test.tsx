import type { ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_tokens, mock_usd } from "#/services/api/mock";
import {
  type CryptoDonationDetails,
  type DafDonationDetails,
  donation_recipient_init,
  type Init,
  type IraQcdDonationDetails,
  type StocksDonationDetails,
  type StripeDonationDetails,
} from "../types";
import { Form as Crypto } from "./crypto/form";
import { Form as Daf } from "./daf/form";
import { Form as IraQcd } from "./ira-qcd/form";
import { Form as Stocks } from "./stocks/form";
import { Form as Stripe } from "./stripe/form";
import { Form as StripeBank } from "./stripe-bank/form";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} }));
vi.mock("../context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));
// the express rails carry no part of this contract, and the real ones reach for
// a router no case here mounts. stripe/form.test.tsx drives their behavior.
vi.mock("./paypal", () => ({ Paypal: () => null }));
vi.mock("./stripe/express-checkout", () => ({ ExpressCheckout: () => null }));

const daf_fv: DafDonationDetails = {
  amount: "100",
  cover_processing_fee: true,
  tip: "",
  tip_format: "20",
};
const ira_qcd_fv: IraQcdDonationDetails = {
  amount: "100",
  custodian: "Fidelity",
  tip: "",
  tip_format: "20",
};
const crypto_fv: CryptoDonationDetails = {
  token: { ...mock_tokens[0], amount: "100", min: 1, usdpu: 1 },
  cover_processing_fee: true,
  tip: "",
  tip_format: "20",
};
const stocks_fv: StocksDonationDetails = {
  ticker: {
    symbol: "AAPL",
    name: "Apple Inc.",
    amount: "10",
    min: 1,
    usdpu: 150,
  },
  tip: "",
  tip_format: "20",
};
const stripe_fv: StripeDonationDetails = {
  amount: "100",
  currency: mock_usd,
  frequency: "one-time",
  cover_processing_fee: true,
  tip: "",
  tip_format: "20",
};
const stripe_bank_fv: StripeDonationDetails = { ...stripe_fv };

interface Method {
  label: string;
  /** a fresh mount, nothing persisted */
  blank: ReactElement;
  /** the same form rehydrated from persisted details carrying tip_format "20" */
  saved: ReactElement;
  /** the amount those persisted details put in the amount field */
  amount: string;
}

const methods: Method[] = [
  {
    label: "stripe",
    blank: <Stripe step="form" type="stripe" />,
    saved: <Stripe step="form" type="stripe" fv={stripe_fv} />,
    amount: stripe_fv.amount,
  },
  {
    label: "stripe_bank",
    blank: <StripeBank step="form" type="stripe_bank" />,
    saved: <StripeBank step="form" type="stripe_bank" fv={stripe_bank_fv} />,
    amount: stripe_bank_fv.amount,
  },
  {
    label: "crypto",
    blank: <Crypto step="form" type="crypto" />,
    saved: <Crypto step="form" type="crypto" fv={crypto_fv} />,
    amount: crypto_fv.token.amount,
  },
  {
    label: "stocks",
    blank: <Stocks step="form" type="stocks" />,
    saved: <Stocks step="form" type="stocks" fv={stocks_fv} />,
    amount: stocks_fv.ticker.amount,
  },
  {
    label: "daf",
    blank: <Daf step="form" type="daf" />,
    saved: <Daf step="form" type="daf" fv={daf_fv} />,
    amount: daf_fv.amount,
  },
  {
    label: "ira_qcd",
    blank: <IraQcd step="form" type="ira_qcd" />,
    saved: <IraQcd step="form" type="ira_qcd" fv={ira_qcd_fv} />,
    amount: ira_qcd_fv.amount,
  },
];

const init: Init = {
  base_url: "",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
};

beforeEach(() => {
  don_mock.value = init;
  don_set_mock.mockReset();
});

describe("every donate method's form keeps the same shell", () => {
  test.each(
    methods
  )("$label: an empty submit names the missing amount and puts focus on it", async ({
    blank,
  }) => {
    const screen = await render(blank);

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

  test.each(
    methods
  )("$label: persisted details rehydrate the amount, and continue hands them on", async ({
    saved,
    amount,
  }) => {
    const screen = await render(saved);

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue(amount);

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(don_set_mock).toHaveBeenCalledOnce());
  });

  test.each(
    methods
  )("$label: the tip is off on a fresh mount, with no percent preselected", async ({
    blank,
  }) => {
    const screen = await render(blank);

    // ncn compliance: nothing is opted in on the donor's behalf
    await expect
      .element(
        screen.getByRole("checkbox", {
          name: /support free fundraising tools/i,
        })
      )
      .not.toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: /15%/i }))
      .not.toBeChecked();
  });

  test.each(
    methods
  )("$label: a persisted tip format turns the tip on at that percent", async ({
    saved,
  }) => {
    const screen = await render(saved);

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
  });
});
