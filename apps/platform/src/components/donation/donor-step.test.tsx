import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_address_fv_init, donor_fv_blank } from "@/donations/schema";
import { donation_recipient_init, type Init } from "./types";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({ value: {} as Init }));
vi.mock("./context", () => ({
  use_donation: vi
    .fn()
    .mockImplementation(() => ({ don: don_mock.value, don_set: don_set_mock })),
}));

import { DonorStep } from "./donor-step";

const base_init: Init = {
  base_url: "",
  source: "bg-marketplace",
  config: null,
  recipient: donation_recipient_init(),
  mode: "live",
};

describe("DonorStep: address not required", () => {
  test("submits without address fields", async () => {
    don_mock.value = {
      ...base_init,
      recipient: donation_recipient_init({ donor_address_required: false }),
    };
    const on_change = vi.fn();

    const screen = await render(
      <DonorStep
        value={{
          ...donor_fv_blank,
          email: "john@doe.com",
          first_name: "John",
          last_name: "Doe",
        }}
        on_back={vi.fn()}
        on_change={on_change}
      />
    );

    // address fields not rendered
    await expect
      .element(screen.getByLabelText(/street/i))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByLabelText(/city/i))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByLabelText(/zip code/i))
      .not.toBeInTheDocument();

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledOnce());
    expect(on_change.mock.calls[0][0].address).toBeUndefined();
  });
});

describe("DonorStep: address required", () => {
  test("shows validation errors, then submits after filling address", async () => {
    don_mock.value = {
      ...base_init,
      recipient: donation_recipient_init({ donor_address_required: true }),
    };
    const on_change = vi.fn();

    const screen = await render(
      <DonorStep
        value={{
          ...donor_fv_blank,
          email: "john@doe.com",
          first_name: "John",
          last_name: "Doe",
          address: donor_address_fv_init,
        }}
        on_back={vi.fn()}
        on_change={on_change}
      />
    );

    // address fields rendered
    await expect.element(screen.getByLabelText(/street/i)).toBeVisible();
    await expect.element(screen.getByLabelText(/city/i)).toBeVisible();
    await expect.element(screen.getByLabelText(/zip code/i)).toBeVisible();

    // submit with empty address — validation errors
    await screen.getByRole("button", { name: /continue/i }).click();
    expect(on_change).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      const errors = screen.container.querySelectorAll('[data-error="true"]');
      expect(errors.length).toBeGreaterThan(0);
    });

    // fill address fields
    await screen.getByLabelText(/street/i).fill("123 Main St");
    await screen.getByLabelText(/city/i).fill("New York");
    await screen.getByLabelText(/zip code/i).fill("10001");

    // select country via combobox
    await screen.getByRole("combobox", { name: /country/i }).clear();
    await screen.getByRole("combobox", { name: /country/i }).fill("Canada");
    await screen.getByRole("option", { name: /canada/i }).click();

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledOnce());
    expect(on_change.mock.calls[0][0].address).toBeDefined();
  });
});

describe("DonorStep: employer field", () => {
  test("asks for an employer, stays optional, and submits what was typed", async () => {
    don_mock.value = {
      ...base_init,
      recipient: donation_recipient_init({ donor_address_required: false }),
    };
    const on_change = vi.fn();

    const screen = await render(
      <DonorStep
        value={{
          ...donor_fv_blank,
          email: "john@doe.com",
          first_name: "John",
          last_name: "Doe",
        }}
        on_back={vi.fn()}
        on_change={on_change}
      />
    );

    // label, hint and placeholder must agree that this asks for an employer —
    // a hint under a field still labelled "your company" is what produced the
    // nonprofits and personal names in the prod data
    const employer = screen.getByLabelText(/your employer/i);
    await expect.element(employer).toBeVisible();
    await expect
      .element(employer)
      .toHaveAttribute("placeholder", "e.g. Microsoft");
    await expect
      .element(screen.getByText(/many employers match their employees/i))
      .toBeVisible();

    // nothing here may assert an outcome — only verified employers can get a
    // determination, so a pre-checkout claim would be false for most donors
    await expect
      .element(
        screen.getByText(/your gift will be|will be doubled|we'll match/i)
      )
      .not.toBeInTheDocument();

    await employer.fill("Microsoft");
    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledOnce());
    expect(on_change.mock.calls[0][0].company_name).toBe("Microsoft");
  });

  test("submits with the employer left blank", async () => {
    don_mock.value = {
      ...base_init,
      recipient: donation_recipient_init({ donor_address_required: false }),
    };
    const on_change = vi.fn();

    const screen = await render(
      <DonorStep
        value={{
          ...donor_fv_blank,
          email: "john@doe.com",
          first_name: "John",
          last_name: "Doe",
        }}
        on_back={vi.fn()}
        on_change={on_change}
      />
    );

    await screen.getByRole("button", { name: /continue/i }).click();
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledOnce());
    expect(on_change.mock.calls[0][0].company_name).toBeFalsy();
  });
});

describe("DonorStep: in-flight submission", () => {
  test("a second press during submission does not fire a second submit", async () => {
    don_mock.value = {
      ...base_init,
      recipient: donation_recipient_init({ donor_address_required: false }),
    };
    // never settles, so the press stays in flight for the whole assertion
    const on_change = vi.fn(() => new Promise<void>(() => {}));

    const screen = await render(
      <DonorStep
        value={{
          ...donor_fv_blank,
          email: "john@doe.com",
          first_name: "John",
          last_name: "Doe",
        }}
        on_back={vi.fn()}
        on_change={on_change}
      />
    );

    const btn = screen.getByRole("button", { name: "Continue" });
    await btn.click();

    // the label never changes — pressing Continue swaps the whole screen, so
    // the guard is the fix here and a spinner would just be a flicker
    await expect.element(btn).toBeDisabled();
    expect(on_change).toHaveBeenCalledOnce();

    // a native dispatch, not a driven click: playwright waits for a control to
    // be enabled, and being unpressable is what is under test
    btn.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(on_change).toHaveBeenCalledOnce();
  });
});
