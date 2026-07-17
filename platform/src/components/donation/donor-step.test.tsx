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
