import { HttpResponse, http } from "msw";
import { href } from "react-router";
import { SWRConfig } from "swr";
import { afterAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mock_usd } from "#/services/api/mock";
import { mswWorker } from "#/setup-tests-browser";
import { donor_fv_blank } from "@/donations/schema";
import {
  donation_recipient_init,
  type Init,
  type StripeDonationDetails,
  type TDonation,
} from "../../types";
import { DonateMethods } from "../methods";
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
      .element(
        screen.getByText(
          "0.8% fee, capped at $5. Saves vs. card (2.2% + $0.30)."
        )
      )
      .toBeVisible();
  });

  test("a pinned mount insets the fields and sticks the button", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
      pin: true,
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe_bank" />);

    const inset = screen.container.querySelector(".p-5");
    expect(inset?.classList.contains("p-5")).toBe(true);
    expect(inset?.classList.contains("sm:p-6")).toBe(true);
    const pin = screen.container.querySelector("[data-pin]");
    const btn = screen.getByRole("button", { name: /continue/i }).element();
    expect(pin?.contains(btn)).toBe(true);
    expect(inset?.contains(btn)).toBe(false);
    expect(btn.className).not.toContain("mt-auto");
  });

  test("an unpinned mount does not gain the pin inset", async () => {
    const init: Init = {
      base_url: "",
      source: "bg-marketplace",
      config: null,
      recipient: donation_recipient_init(),
      mode: "live",
    };
    don_mock.value = init;

    const screen = await render(<Form step="form" type="stripe_bank" />);

    expect(screen.container.querySelector(".p-5")).toBeNull();
    expect(screen.container.querySelector("[data-pin]")).toBeNull();
    expect(
      screen.getByRole("button", { name: /continue/i }).element().className
    ).toContain("mt-auto");
  });

  test("a pinned method list shares the field inset", async () => {
    const don: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init(),
      donor: donor_fv_blank,
      config: {
        id: null,
        success_redirect: undefined,
        method_ids: ["stripe", "stripe_bank"],
        freq_opts: undefined,
      },
      method: "stripe_bank",
      pin: true,
    };
    don_mock.value = don;

    const screen = await render(<DonateMethods {...don} />);

    const label = screen.getByText("Payment method", { exact: true }).element();
    const list = screen.getByRole("tablist").element();
    expect(label.classList.contains("px-5")).toBe(true);
    expect(label.classList.contains("sm:px-6")).toBe(true);
    expect(list.classList.contains("px-5")).toBe(true);
    expect(list.classList.contains("sm:px-6")).toBe(true);
    expect(label.className.includes("@xl/steps:p-0")).toBe(false);
    expect(list.className.includes("@xl/steps:p-0")).toBe(false);

    const amount = screen
      .getByPlaceholder(/enter amount/i)
      .element()
      .closest(".field-input-container");
    expect(amount).not.toBeNull();
    const field = amount as HTMLElement;
    const column = field.closest(".p-5");
    expect(column?.classList.contains("sm:p-6")).toBe(true);

    const pad = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        left: box.left + Number.parseFloat(style.paddingLeft),
        right: box.right - Number.parseFloat(style.paddingRight),
      };
    };
    const label_edge = pad(label);
    const list_edge = pad(list);
    const field_box = field.getBoundingClientRect();
    const tiles = [
      screen.getByRole("tab", { name: /^card$/i }).element(),
      screen.getByRole("tab", { name: /bank transfer/i }).element(),
    ].map((el) => el.getBoundingClientRect());
    const tile_left = Math.min(...tiles.map((box) => box.left));
    const tile_right = Math.max(...tiles.map((box) => box.right));

    expect(list_edge.left).toBeCloseTo(label_edge.left, 0);
    expect(list_edge.right).toBeCloseTo(label_edge.right, 0);
    expect(tile_left).toBeCloseTo(label_edge.left, 0);
    expect(tile_right).toBeCloseTo(label_edge.right, 0);
    expect(field_box.left).toBeCloseTo(label_edge.left, 0);
    expect(field_box.right).toBeCloseTo(label_edge.right, 0);
  });

  test("an unpinned method list keeps the side rail padding", async () => {
    const don: TDonation = {
      base_url: "",
      source: "bg-marketplace",
      mode: "live",
      recipient: donation_recipient_init(),
      donor: donor_fv_blank,
      config: {
        id: null,
        success_redirect: undefined,
        method_ids: ["stripe", "stripe_bank"],
        freq_opts: undefined,
      },
      method: "stripe_bank",
    };
    don_mock.value = don;

    const screen = await render(<DonateMethods {...don} />);
    const label = screen.getByText("Payment method", { exact: true }).element();
    const list = screen.getByRole("tablist").element();
    expect(label.classList.contains("p-4")).toBe(true);
    expect(label.classList.contains("px-5")).toBe(false);
    expect(list.classList.contains("p-4")).toBe(true);
    expect(list.className.includes("@xl/steps:p-0")).toBe(true);
  });
});
