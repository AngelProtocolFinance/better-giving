import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import type { DonateMethodId } from "@/npo";
import { Steps } from "../index";

import { type Config, donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";

describe("payment method form state persistence", () => {
  const all_methods_config: Config = {
    success_redirect: undefined,
    method_ids: [
      "stripe",
      "stripe_bank",
      "crypto",
      "daf",
      "stocks",
      "ira_qcd",
    ] as DonateMethodId[],
    freq_opts: undefined,
    id: null,
    stripe: undefined,
  };

  test("crypto: form state persists when navigating to checkout and back", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "crypto",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Select crypto tab
    const crypto_tab = screen.getByRole("tab", { name: /crypto/i });
    await crypto_tab.click();

    // Select token
    const token_selector = screen.getByRole("combobox");
    await token_selector.click();
    await expect.element(screen.getByRole("option")).toBeVisible();
    await screen.getByRole("option").first().click();

    // Input amount
    const amount_input = screen.getByPlaceholder(/enter amount/i);
    await amount_input.fill("2");

    // Submit to donor step
    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await continue_btn.click();

    // Should be on donor step now - fill donor info
    const email_input = screen.getByPlaceholder(/john@doe\.com/i);
    await expect.element(email_input).toBeVisible();
    await email_input.fill("john@doe.com");

    const first_name_input = screen.getByRole("textbox", {
      name: /first name/i,
    });
    await first_name_input.fill("John");

    const last_name_input = screen.getByRole("textbox", { name: /last name/i });
    await last_name_input.fill("Doe");

    // Continue to checkout
    const continue_btn2 = screen.getByRole("button", { name: /continue/i });
    await continue_btn2.click();

    // Should be on checkout page - look for crypto-specific button
    await expect
      .element(
        screen.getByRole("button", {
          name: /i have completed the payment/i,
        })
      )
      .toBeVisible();

    // Go back to donor step
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // Verify donor state persists
    await expect
      .element(screen.getByPlaceholder(/john@doe\.com/i))
      .toHaveValue("john@doe.com");
    await expect
      .element(screen.getByRole("textbox", { name: /first name/i }))
      .toHaveValue("John");
    await expect
      .element(screen.getByRole("textbox", { name: /last name/i }))
      .toHaveValue("Doe");

    // Go back to form
    const back_btn2 = screen.getByRole("button", { name: /go back/i });
    await back_btn2.click();

    // Verify form state persists
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("2");
  });

  test("daf: form state persists when navigating to checkout and back", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "daf",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Select DAF tab
    const daf_tab = screen.getByRole("tab", { name: /donor advised fund/i });
    await daf_tab.click();

    // input amount
    const amount_input = screen.getByPlaceholder(/enter amount/i);
    await amount_input.fill("500");

    // submit directly to checkout (donor step is skipped)
    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await continue_btn.click();

    // should be on checkout page - daf uses chariot widget, check we left the form
    await expect
      .element(screen.getByTestId("donate-methods"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /go back/i }))
      .toBeVisible();

    // go back to form (donor step is skipped)
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // verify form state persists
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("500");
  });

  test("stocks: form state persists when navigating to checkout and back", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "stocks",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Select stocks tab
    const stocks_tab = screen.getByRole("tab", { name: /stocks/i });
    await stocks_tab.click();

    // Select ticker
    const ticker_selector = screen.getByRole("combobox");
    await ticker_selector.click();
    await expect.element(screen.getByRole("option")).toBeVisible();
    await screen.getByRole("option").first().click();

    const amount_input = screen.getByPlaceholder(/enter amount/i);
    await expect.element(amount_input).toBeVisible();
    await amount_input.fill("10");

    // submit directly to checkout (donor step is skipped)
    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await continue_btn.click();

    // should be on checkout page - look for stocks-specific text
    await expect.element(screen.getByText(/donation pending/i)).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /generate email/i }))
      .toBeVisible();

    // go back to form (donor step is skipped)
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // verify form state persists
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("10");
  });

  test("ira_qcd: form state persists when navigating to checkout and back", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "ira_qcd",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Select IRA/QCD tab
    const ira_tab = screen.getByRole("tab", { name: /ira \/ qcd/i });
    await ira_tab.click();

    // input amount
    const amount_input = screen.getByPlaceholder(/enter amount/i);
    await amount_input.fill("300");

    // submit directly to checkout (donor step is skipped)
    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await continue_btn.click();

    // should be on checkout page - ira/qcd shows pending text
    await expect
      .element(screen.getByText(/ira donation pending/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /generate email/i }))
      .toBeVisible();

    // go back to form (donor step is skipped)
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // verify form state persists
    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("300");
  });

  test("form state persists when switching between payment methods after checkout", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "crypto",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Fill crypto form
    const crypto_tab = screen.getByRole("tab", { name: /crypto/i });
    await crypto_tab.click();

    const token_selector = screen.getByRole("combobox");
    await expect.element(token_selector).toBeVisible();
    await token_selector.click();
    await expect.element(screen.getByRole("option")).toBeVisible();
    await screen.getByRole("option").first().click();

    let amount_input = screen.getByPlaceholder(/enter amount/i);
    await expect.element(amount_input).toBeVisible();
    await amount_input.fill("5");

    // Submit to donor step
    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await expect.element(continue_btn).toBeVisible();
    await continue_btn.click();

    // Fill donor info
    const email_input = screen.getByPlaceholder(/john@doe\.com/i);
    await expect.element(email_input).toBeVisible();
    await email_input.fill("alice@example.com");

    const first_name_input = screen.getByRole("textbox", {
      name: /first name/i,
    });
    await first_name_input.fill("Alice");

    const last_name_input = screen.getByRole("textbox", { name: /last name/i });
    await last_name_input.fill("Smith");

    // Submit to checkout to persist state in context
    const continue_btn2 = screen.getByRole("button", { name: /continue/i });
    await continue_btn2.click();

    // Should be on checkout page
    await expect
      .element(
        screen.getByRole("button", {
          name: /i have completed the payment/i,
        })
      )
      .toBeVisible();

    // Go back to donor step
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // Verify donor info persists, then go back to form
    await expect
      .element(screen.getByPlaceholder(/john@doe\.com/i))
      .toHaveValue("alice@example.com");
    const back_btn2 = screen.getByRole("button", { name: /go back/i });
    await back_btn2.click();

    // switch to daf (tabs should already be rendered)
    const daf_tab = screen.getByRole("tab", { name: /donor advised fund/i });
    await daf_tab.click();

    // fill daf form
    amount_input = screen.getByPlaceholder(/enter amount/i);
    await amount_input.fill("1000");

    // submit directly to checkout (donor step is skipped for daf)
    const continue_btn3 = screen.getByRole("button", { name: /continue/i });
    await continue_btn3.click();

    // should be on daf checkout
    await expect
      .element(screen.getByTestId("donate-methods"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /go back/i }))
      .toBeVisible();

    // go back to form (donor step is skipped for daf)
    const back_btn3 = screen.getByRole("button", { name: /go back/i });
    await back_btn3.click();

    // switch back to crypto - form state should persist (tabs already rendered)
    const crypto_tab2 = screen.getByRole("tab", { name: /crypto/i });
    await crypto_tab2.click();

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("5");

    // Switch back to DAF - form state should persist
    const daf_tab2 = screen.getByRole("tab", { name: /donor advised fund/i });
    await daf_tab2.click();

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("1000");
  });

  test("form state persists after going to checkout from one method and switching to another", async () => {
    const init: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init({ hide_bg_tip: true }),
      donor: donor_fv_blank,
      config: all_methods_config,
      method: "crypto",
    };
    const Stub = stb(<Steps init={init} />);
    const screen = await render(<Stub />);

    // Wait for donate-methods to render
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // Fill and submit crypto form to checkout - this persists state in context
    const crypto_tab = screen.getByRole("tab", { name: /crypto/i });
    await crypto_tab.click();

    const token_selector = screen.getByRole("combobox");
    await expect.element(token_selector).toBeVisible();
    await token_selector.click();
    await expect.element(screen.getByRole("option")).toBeVisible();
    await screen.getByRole("option").first().click();

    let amount_input = screen.getByPlaceholder(/enter amount/i);
    await expect.element(amount_input).toBeVisible();
    await amount_input.fill("2");

    const continue_btn = screen.getByRole("button", { name: /continue/i });
    await continue_btn.click();

    // Fill donor info
    const email_input = screen.getByPlaceholder(/john@doe\.com/i);
    await expect.element(email_input).toBeVisible();
    await email_input.fill("bob@example.com");

    const first_name_input = screen.getByRole("textbox", {
      name: /first name/i,
    });
    await first_name_input.fill("Bob");

    const last_name_input = screen.getByRole("textbox", { name: /last name/i });
    await last_name_input.fill("Johnson");

    const continue_btn2 = screen.getByRole("button", { name: /continue/i });
    await continue_btn2.click();

    // Should be on crypto checkout
    await expect
      .element(
        screen.getByRole("button", {
          name: /i have completed the payment/i,
        })
      )
      .toBeVisible();

    // Go back to donor step
    const back_btn = screen.getByRole("button", { name: /go back/i });
    await back_btn.click();

    // Go back to form
    const back_btn2 = screen.getByRole("button", { name: /go back/i });
    await back_btn2.click();

    // wait for donate-methods to render again
    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();

    // fill daf form and go to checkout - this also persists daf state in context (tabs already rendered)
    const daf_tab = screen.getByRole("tab", {
      name: /donor advised fund/i,
    });
    await daf_tab.click();

    amount_input = screen.getByPlaceholder(/enter amount/i);
    await amount_input.fill("750");

    // submit directly to checkout (donor step is skipped for daf)
    const continue_btn3 = screen.getByRole("button", { name: /continue/i });
    await continue_btn3.click();

    // should be on daf checkout - check we left the form
    await expect
      .element(screen.getByTestId("donate-methods"))
      .not.toBeInTheDocument();

    // go back to form (donor step is skipped for daf)
    const back_btn3 = screen.getByRole("button", { name: /go back/i });
    await back_btn3.click();

    // switch back to crypto - all form state should persist from context (tabs already rendered)
    const crypto_tab2 = screen.getByRole("tab", { name: /crypto/i });
    await crypto_tab2.click();

    await expect
      .element(screen.getByPlaceholder(/enter amount/i))
      .toHaveValue("2");
  });
});
