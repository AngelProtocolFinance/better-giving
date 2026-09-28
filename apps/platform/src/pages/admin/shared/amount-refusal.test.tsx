import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { TransferForm } from "./transfer-form";
import type { Props } from "./withdraw-form";
import { WithdrawForm } from "./withdraw-form";

const refusal = "amount exceeds balance";

describe.each([
  { name: "withdraw", Form: WithdrawForm },
  { name: "transfer", Form: TransferForm },
])("$name form — server refusal", ({ Form }) => {
  const mount = async () => {
    const on_submit = vi.fn();
    const at = (p: Partial<Props>) => (
      <MemoryRouter>
        <Form
          from="liq"
          bals={{ liq: 100, lock: 200 }}
          onSubmit={on_submit}
          {...p}
        />
      </MemoryRouter>
    );
    const screen = await render(at({}));
    const submit = screen.getByRole("button", { name: "Submit" });
    // the dialog backdrop intercepts playwright's pointer; native click
    // doesn't move focus, so the press is focus + click
    const press = () => {
      const el = submit.element() as HTMLElement;
      el.focus();
      el.click();
    };
    return {
      screen,
      at,
      press,
      on_submit,
      amount: screen.getByLabelText("Amount"),
    };
  };

  test("refusal lands on the amount field, focuses it, re-lands on a repeat, clears on edit", async () => {
    const { screen, at, press, on_submit, amount } = await mount();

    await amount.fill("50");
    press();
    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledOnce());
    await expect.element(amount).toHaveAttribute("aria-invalid", "false");

    // no error: submit settling leaves the field alone
    await screen.rerender(at({ is_submitting: false }));
    await expect.element(amount).not.toHaveFocus();
    await expect.element(amount).toHaveAttribute("aria-invalid", "false");

    await screen.rerender(at({ is_submitting: false, error: refusal }));
    await expect.element(amount).toHaveFocus();
    await expect.element(amount).toHaveAttribute("aria-invalid", "true");
    const msg = screen.getByText(refusal);
    await expect.element(msg).toBeVisible();
    const msg_id = msg.element().id;
    expect(amount.element().getAttribute("aria-describedby")).toContain(msg_id);

    // a second tab spent it again: same string, new refusal
    press();
    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledTimes(2));
    await screen.rerender(at({ is_submitting: true, error: refusal }));
    await expect.element(screen.getByText(refusal)).not.toBeInTheDocument();
    await expect.element(amount).not.toHaveFocus();
    await screen.rerender(at({ is_submitting: false, error: refusal }));
    await expect.element(amount).toHaveFocus();
    await expect.element(screen.getByText(refusal)).toBeVisible();

    await amount.fill("40");
    await expect.element(screen.getByText(refusal)).not.toBeInTheDocument();
    await expect.element(amount).toHaveAttribute("aria-invalid", "false");
  });

  test("a revalidated balance is what the amount is checked against, and the refusal and amount survive it", async () => {
    const { screen, at, press, on_submit, amount } = await mount();

    await amount.fill("60");
    press();
    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledOnce());
    await screen.rerender(at({ error: refusal }));
    await expect.element(screen.getByText(refusal)).toBeVisible();

    // the loader lands the server's balance after the refusal
    await screen.rerender(at({ error: refusal, bals: { liq: 40, lock: 200 } }));
    await expect.element(screen.getByText(refusal)).toBeVisible();
    await expect.element(amount).toHaveValue("60");

    // correction pass checks against 40, not the stale 100
    await amount.fill("50");
    await expect.element(screen.getByText(refusal)).toBeVisible();
    press();
    await expect.element(screen.getByText(refusal)).toBeVisible();
    expect(on_submit).toHaveBeenCalledOnce();

    await amount.fill("30");
    await expect.element(screen.getByText(refusal)).not.toBeInTheDocument();
    press();
    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledTimes(2));
    expect(on_submit.mock.lastCall?.[0]).toMatchObject({ amount: "30" });
  });
});
