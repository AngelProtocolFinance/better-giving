import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { layer_ready, settle_frames } from "#/__tests__/fixtures/layer-ready";
import { owed_row } from "./test-row";
import { type IWriteOffDialog, WriteOffDialog } from "./write-off-dialog";

// native clicks: the dialog backdrop fails playwright's actionability check
const press = (el: Element) => (el as HTMLElement).click();

type THarness = Partial<Omit<IWriteOffDialog, "open" | "row" | "on_close">>;

/** a row action that opens the dialog, as the table's does */
function Harness(p: THarness) {
  const [open, set_open] = useState(false);
  return (
    <>
      <button type="button" onClick={() => set_open(true)}>
        Write off River Trust
      </button>
      <WriteOffDialog
        open={open}
        row={owed_row()}
        submitting={false}
        on_submit={() => {}}
        on_close={() => set_open(false)}
        {...p}
      />
    </>
  );
}

const dialog_props = (o: Partial<IWriteOffDialog> = {}): IWriteOffDialog => ({
  open: true,
  row: owed_row(),
  submitting: false,
  on_submit: vi.fn(),
  on_close: vi.fn(),
  ...o,
});

describe("write-off dialog", () => {
  test("named by its heading; refuses a blank reason, sends a trimmed one, and returns focus to the row action", async () => {
    const on_submit = vi.fn();
    const screen = await render(<Harness on_submit={on_submit} />);
    const opener = screen.getByRole("button", {
      name: "Write off River Trust",
    });
    await opener.click();

    const dialog = screen.getByRole("dialog", {
      name: "Write off amount owed",
      exact: true,
    });
    await expect.element(dialog).toBeVisible();
    await expect.element(screen.getByText("don-1")).toBeVisible();
    await expect.element(screen.getByText("53.20")).toBeVisible();

    const reason = screen.getByLabelText("Reason");
    await reason.fill("   ");
    press(
      screen.getByRole("button", { name: "Write off", exact: true }).element()
    );
    await expect.element(screen.getByText("required")).toBeVisible();
    await expect.element(reason).toHaveFocus();
    expect(on_submit).not.toHaveBeenCalled();

    await reason.fill("  npo closed  ");
    press(
      screen.getByRole("button", { name: "Write off", exact: true }).element()
    );
    await vi.waitFor(() =>
      expect(on_submit).toHaveBeenCalledWith({ reason: "npo closed" })
    );

    press(screen.getByRole("button", { name: "Cancel" }).element());
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
  });

  test("submitting holds the dialog: submit and cancel do nothing, Escape doesn't close it", async () => {
    const p = dialog_props({ submitting: true });
    const screen = await render(<WriteOffDialog {...p} />);
    const submit = screen.getByRole("button", { name: "Writing off…" });
    await expect.element(submit).toHaveAttribute("aria-disabled", "true");
    await expect.element(submit).toHaveAttribute("aria-busy", "true");

    await screen.getByLabelText("Reason").fill("npo closed");
    press(submit.element());
    press(screen.getByRole("button", { name: "Cancel" }).element());
    await layer_ready();
    await userEvent.keyboard("{Escape}");
    await settle_frames();
    expect(p.on_submit).not.toHaveBeenCalled();
    expect(p.on_close).not.toHaveBeenCalled();
  });

  test("a refusal is shown at the submit", async () => {
    const screen = await render(
      <WriteOffDialog {...dialog_props({ error: "Row is already settled" })} />
    );
    const alert = screen.getByRole("alert");
    await expect.element(alert).toMatchTextContent("Row is already settled");
    await expect
      .element(screen.getByRole("button", { name: "Write off", exact: true }))
      .toHaveAccessibleDescription("Row is already settled");
  });
});
