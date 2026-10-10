import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { DialogActions } from "./dialog-actions";

const noop = () => {};

describe("dialog actions", () => {
  test("two mounted at once each describe their submit by their own refusal", async () => {
    const screen = await render(
      <>
        <form>
          <DialogActions
            submitting={false}
            error="Already written off"
            label="Write off"
            busy_label="Writing off…"
            tone="btn-destructive"
            on_close={noop}
          />
        </form>
        <form>
          <DialogActions
            submitting={false}
            error="Credit exceeds what is owed"
            label="Credit"
            busy_label="Crediting…"
            tone="btn-primary"
            on_close={noop}
          />
        </form>
      </>
    );
    await expect
      .element(screen.getByRole("button", { name: "Write off", exact: true }))
      .toHaveAccessibleDescription("Already written off");
    await expect
      .element(screen.getByRole("button", { name: "Credit", exact: true }))
      .toHaveAccessibleDescription("Credit exceeds what is owed");
    const ids = screen
      .getByRole("alert")
      .elements()
      .map((el: Element) => el.id);
    expect(new Set(ids).size).toBe(2);
  });
});
