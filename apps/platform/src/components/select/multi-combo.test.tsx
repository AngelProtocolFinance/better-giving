import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MultiCombo } from "./multi-combo";

const countries = ["Argentina", "Brazil", "Chile", "Denmark"];

function Harness(p: { on_change?: (v: string[]) => void; initial?: string[] }) {
  const [values, set_values] = useState<string[]>(p.initial ?? []);
  return (
    <>
      <button type="button">before</button>
      <MultiCombo
        values={values}
        options={countries}
        on_change={(v) => {
          set_values(v);
          p.on_change?.(v);
        }}
        on_reset={() => set_values([])}
      />
    </>
  );
}

describe("MultiCombo", () => {
  // the control used to carry two focus hacks — a tabIndex=-1 `FocusableInput`
  // for the RHF ref and a bare tabbable `<input>` standing in for the hidden
  // search box. both are gone; this is what has to still hold.
  test("tab reaches the control, arrows + enter select", async () => {
    const on_change = vi.fn();
    const screen = await render(<Harness on_change={on_change} />);

    await screen.getByRole("button", { name: "before" }).click();
    await userEvent.tab();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect
      .element(screen.getByRole("option", { name: "Argentina" }))
      .toBeVisible();
    await userEvent.keyboard("{Enter}");

    expect(on_change).toHaveBeenCalledWith(["Argentina"]);
  });

  test("a selected value renders a tag whose remove button deselects", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <Harness initial={["Brazil"]} on_change={on_change} />
    );

    // [0] "before", [1] the tag's remove button, [2] the drawer trigger
    await expect.element(screen.getByText("Brazil").first()).toBeVisible();
    await screen.getByRole("button").nth(1).click();
    expect(on_change).toHaveBeenCalledWith([]);
  });

  test("select all, then deselect all", async () => {
    const on_change = vi.fn();
    const screen = await render(<Harness on_change={on_change} />);

    await screen.getByRole("combobox").click();
    await screen.getByRole("button", { name: "Select All" }).click();
    expect(on_change).toHaveBeenCalledWith(countries);

    await screen.getByRole("button", { name: "Deselect All" }).click();
    expect(on_change).toHaveBeenCalledWith([]);
  });

  test("typing filters; no match shows the status line", async () => {
    const screen = await render(<Harness />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    expect(screen.getByRole("option").elements().length).toBe(4);

    await combo.fill("bra");
    expect(screen.getByRole("option").elements().length).toBe(1);

    await combo.fill("zzz");
    expect(screen.getByRole("option").query()).toBeNull();
    await expect.element(screen.getByText("zzz not found")).toBeVisible();
  });

  test("a selected option filtered out of the query still renders", async () => {
    const screen = await render(<Harness initial={["Argentina"]} />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    await combo.fill("chi");

    // Chile matched; Argentina is rehydrated so the value stays resolvable
    await expect
      .element(screen.getByRole("option", { name: "Chile" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("option", { name: /Argentina/ }))
      .toBeVisible();
  });
});
