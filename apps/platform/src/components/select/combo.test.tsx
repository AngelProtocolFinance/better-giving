import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Combo } from "./combo";
import type { SyncSource } from "./types";

const countries = ["Argentina", "Brazil", "Chile", "Denmark"];

function RhfHarness() {
  const { watch, setValue, reset } = useForm<{ country: string }>({
    defaultValues: { country: "" },
  });
  const country = watch("country");
  return (
    <>
      {/* above the control: the popup opens downward and would swallow the click */}
      <p data-testid="outside">outside</p>
      <Combo
        value={country || undefined}
        on_change={(c) => setValue("country", c ?? "")}
        options={countries}
        placeholder="Select a country"
        adornment={() => <span>drawer</span>}
      />
      <button type="button" onClick={() => reset({ country: "Chile" })}>
        reset-chile
      </button>
      <button type="button" onClick={() => reset({ country: "" })}>
        reset-empty
      </button>
    </>
  );
}

describe("Combo", () => {
  // the reason `inputValue` is left uncontrolled. zag's watch() tracks the
  // value and re-runs syncSelectedItems, which restringifies the input text
  // through the collection — controlling inputValue is what turns that off.
  test("input text follows an externally changed value", async () => {
    const screen = await render(<RhfHarness />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    await screen.getByRole("option", { name: "Argentina" }).click();
    await expect.element(combo).toHaveValue("Argentina");

    await screen.getByRole("button", { name: "reset-chile" }).click();
    await expect.element(combo).toHaveValue("Chile");

    await screen.getByRole("button", { name: "reset-empty" }).click();
    await expect.element(combo).toHaveValue("");
  });

  // zag reverts typed-but-unselected text on click-outside only. a trigger
  // click leaves it stale, which is what SelectedInputSync exists to fix.
  test("closing without picking restores the selected text", async () => {
    const screen = await render(<RhfHarness />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    await screen.getByRole("option", { name: "Argentina" }).click();

    // zag's own path: LAYER.INTERACT_OUTSIDE → revertInputValue
    await combo.fill("Den");
    await screen.getByTestId("outside").click();
    await expect.element(combo).toHaveValue("Argentina");

    // the path zag leaves alone: TRIGGER.CLICK closes without reverting
    await combo.fill("Bra");
    await expect.element(combo).toHaveValue("Bra");
    // ark names the trigger "Toggle suggestions"; it is the first button here
    await screen.getByRole("button").first().click();
    await expect.element(combo).toHaveValue("Argentina");
  });

  test("a selected option the query filters out stays resolvable", async () => {
    const screen = await render(<RhfHarness />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    await screen.getByRole("option", { name: "Argentina" }).click();

    await combo.fill("Chi");
    // rehydrated into the collection, so the text has a label to revert to
    await expect
      .element(screen.getByRole("option", { name: "Argentina" }))
      .toBeVisible();
    await screen.getByTestId("outside").click();
    await expect.element(combo).toHaveValue("Argentina");
  });

  test("clear emits undefined and fires on_reset", async () => {
    const on_change = vi.fn();
    const on_reset = vi.fn();
    function H() {
      const [v, set_v] = useState<string | undefined>("Brazil");
      return (
        <Combo
          value={v}
          on_change={(c) => {
            set_v(c);
            on_change(c);
          }}
          on_reset={on_reset}
          clearable
          options={countries}
        />
      );
    }
    const screen = await render(<H />);
    await screen.getByRole("button").last().click();

    expect(on_reset).toHaveBeenCalled();
    expect(on_change).toHaveBeenCalledWith(undefined);
  });

  test("limit caps the rows; a custom filter replaces the matcher", async () => {
    const screen = await render(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={countries}
        limit={2}
        // whitespace-insensitive, the currency matcher's shape
        filter={(text, q) =>
          text.toLowerCase().replace(/\s+/g, "").includes(q.toLowerCase())
        }
      />
    );
    const combo = screen.getByRole("combobox");

    await combo.click();
    expect(screen.getByRole("option").elements().length).toBe(2);

    await combo.fill("zil");
    await expect
      .element(screen.getByRole("option", { name: "Brazil" }))
      .toBeVisible();
  });

  test("a query source disables the control while it loads or fails", async () => {
    const loading: SyncSource<string> = { items: [], loading: true };
    const screen = await render(
      <Combo value={undefined} on_change={() => {}} options={loading} />
    );
    await expect.element(screen.getByRole("combobox")).toBeDisabled();

    await screen.rerender(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={{ items: [], error: "nope" }}
      />
    );
    await expect.element(screen.getByRole("combobox")).toBeDisabled();

    await screen.rerender(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={{ items: countries }}
      />
    );
    await expect.element(screen.getByRole("combobox")).toBeEnabled();
  });
});
