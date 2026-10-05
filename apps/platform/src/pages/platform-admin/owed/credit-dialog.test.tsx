import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CreditDialog, type ICreditDialog } from "./credit-dialog";
import { owed_row } from "./test-row";

// native clicks: the dialog backdrop fails playwright's actionability check
const press = (el: Element) => (el as HTMLElement).click();

const dialog_props = (o: Partial<ICreditDialog> = {}): ICreditDialog => ({
  open: true,
  row: owed_row(),
  submitting: false,
  on_submit: vi.fn(),
  on_close: vi.fn(),
  ...o,
});

describe("credit dialog", () => {
  test("named by its heading; amount must be above $0 and within the outstanding", async () => {
    const p = dialog_props();
    const screen = await render(<CreditDialog {...p} />);
    await expect
      .element(
        screen.getByRole("dialog", { name: "Credit amount owed", exact: true })
      )
      .toBeVisible();

    const credit = () =>
      press(
        screen.getByRole("button", { name: "Credit", exact: true }).element()
      );
    const usd = screen.getByLabelText("Amount (USD)");
    await screen.getByLabelText("Reason").fill("payout cash share");
    const ref = screen.getByLabelText("Reference");
    // the action refuses a reference this row has already been credited under
    await expect
      .element(ref)
      .toHaveAccessibleDescription(
        /Each credit on this row needs its own reference/
      );
    await ref.fill("po_77");

    for (const bad of ["53.21", "0", "-5", "abc"]) {
      await usd.fill(bad);
      credit();
      await expect
        .element(screen.getByText("between $0.01 and $53.20"))
        .toBeVisible();
    }
    await expect.element(usd).toHaveFocus();
    expect(p.on_submit).not.toHaveBeenCalled();

    await usd.fill("53.20");
    credit();
    await vi.waitFor(() =>
      expect(p.on_submit).toHaveBeenCalledWith({
        usd: 53.2,
        reason: "payout cash share",
        ref: "po_77",
      })
    );
  });

  test("reason and reference are required", async () => {
    const p = dialog_props();
    const screen = await render(<CreditDialog {...p} />);
    await screen.getByLabelText("Amount (USD)").fill("10");
    press(
      screen.getByRole("button", { name: "Credit", exact: true }).element()
    );
    await expect
      .element(screen.getByLabelText("Reason"))
      .toHaveAccessibleDescription("required");
    await screen.getByLabelText("Reason").fill("payout cash share");
    press(
      screen.getByRole("button", { name: "Credit", exact: true }).element()
    );
    await expect
      .element(screen.getByLabelText("Reference"))
      .toHaveAttribute("aria-invalid", "true");
    expect(p.on_submit).not.toHaveBeenCalled();
  });

  test("submitting holds the submit", async () => {
    const p = dialog_props({ submitting: true });
    const screen = await render(<CreditDialog {...p} />);
    await screen.getByLabelText("Amount (USD)").fill("10");
    await screen.getByLabelText("Reason").fill("payout cash share");
    await screen.getByLabelText("Reference").fill("po_77");
    const submit = screen.getByRole("button", { name: "Crediting…" });
    await expect.element(submit).toHaveAttribute("aria-disabled", "true");
    press(submit.element());
    await new Promise((r) => setTimeout(r, 50));
    expect(p.on_submit).not.toHaveBeenCalled();
  });
});
