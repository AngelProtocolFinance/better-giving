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

  // zag's revert guards are all `not("allowCustomValue")`, and SelectedInputSync
  // reverts on paths zag leaves alone — mounting it here would delete the text
  // that IS the value.
  test("allow_custom offers the typed text and keeps it through a close", async () => {
    const on_change = vi.fn();
    function H() {
      const [v, set_v] = useState<string | undefined>();
      return (
        <>
          <p data-testid="outside">outside</p>
          <Combo
            value={v}
            on_change={(c) => {
              set_v(c);
              on_change(c);
            }}
            options={countries}
            allow_custom
            adornment={() => <span>drawer</span>}
          />
        </>
      );
    }
    const screen = await render(<H />);
    const combo = screen.getByRole("combobox");

    await combo.click();
    await combo.fill("Ontario");
    // `allowCustomValue` never emits a value on its own — the row does
    await screen.getByRole("option", { name: "Ontario" }).click();
    expect(on_change).toHaveBeenCalledWith("Ontario");
    await expect.element(combo).toHaveValue("Ontario");

    // the close zag leaves alone, and the one SelectedInputSync exists to
    // cover — it has to leave a custom value where the donor typed it.
    // ark names the trigger "Toggle suggestions"; it is the first button here
    await combo.fill("Manitoba");
    await screen.getByRole("button").first().click();
    await expect.element(combo).toHaveValue("Manitoba");

    // and zag's own revert path, guarded by `not("allowCustomValue")`
    await combo.fill("Saskatchewan");
    await screen.getByTestId("outside").click();
    await expect.element(combo).toHaveValue("Saskatchewan");
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

/**
 * the contract the embedded donation form's currency control needs: an object
 * option type read through `item_key`/`item_text`, and an externally set value
 * the input text has to follow (both stripe forms seed `currency` from
 * `usd_option`, then `setValue` it from the preferred-currency fetch).
 */
describe("Combo over object options", () => {
  const currencies = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
    { code: "AUD" },
  ];
  type Currency = (typeof currencies)[number];

  function setup(value: Currency | undefined = currencies[0]) {
    const on_change = vi.fn();
    return {
      on_change,
      props: {
        value,
        on_change,
        options: currencies,
        item_key: (t: Currency) => t.code,
        item_text: (t: Currency) => t.code,
        placeholder: "Currency",
        adornment: (open: boolean) => <span>{open ? "▲" : "▼"}</span>,
      },
    };
  }

  test("select EUR, reopen → all options visible", async () => {
    const { props, on_change } = setup();
    const screen = await render(<Combo {...props} />);

    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(5);

    await screen.getByRole("option", { name: "EUR" }).click();
    expect(on_change).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EUR" })
    );

    // a pick is not a search: zag reports `item-select`, so the query resets
    // and the reopened list is unfiltered again
    await screen.rerender(<Combo {...props} value={currencies[1]} />);
    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(5);
  });

  test("typing filters options, clearing restores all", async () => {
    const { props } = setup();
    const screen = await render(<Combo {...props} />);

    const combo = screen.getByRole("combobox");
    await combo.click();
    expect(screen.getByRole("option").elements().length).toBe(5);

    await combo.fill("EU");
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();
    // the match, plus the selected USD rehydrated by `use_collection` — a
    // selection the filter drops has no label left to restore the input from
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(2);

    await combo.fill("");
    expect(screen.getByRole("option").elements().length).toBe(5);
  });

  test("an empty list says so; a query nothing matches names the query", async () => {
    // nothing selected: a rehydrated selection would BE a row, and the status
    // line only stands in where there are none
    const { props } = setup();
    const screen = await render(
      <Combo {...props} value={undefined} options={[]} />
    );

    await screen.getByRole("combobox").click();
    await expect.element(screen.getByText("No options found")).toBeVisible();

    await screen.rerender(<Combo {...props} value={undefined} />);
    const combo = screen.getByRole("combobox");
    await combo.fill("xxxx");
    expect(screen.getByRole("option").query()).toBeNull();
    await expect.element(screen.getByText("xxxx not found")).toBeVisible();
  });

  // the whole reason `inputValue` stays uncontrolled — see SelectedInputSync
  test("input text follows an externally set value", async () => {
    function H() {
      const { watch, setValue } = useForm<{ currency: Currency }>({
        defaultValues: { currency: currencies[0] },
      });
      const { props } = setup();
      return (
        <>
          <Combo
            {...props}
            value={watch("currency")}
            on_change={(c) => {
              if (c) setValue("currency", c);
            }}
          />
          <button
            type="button"
            onClick={() => setValue("currency", currencies[2])}
          >
            prefer-gbp
          </button>
        </>
      );
    }
    const screen = await render(<H />);
    const combo = screen.getByRole("combobox");

    await expect.element(combo).toHaveValue("USD");
    await screen.getByRole("button", { name: "prefer-gbp" }).click();
    await expect.element(combo).toHaveValue("GBP");
  });
});

/**
 * the seam draws a full field box until a host says it owns the chrome. the
 * embedded donation form does — its combobox is the left cell of one bordered
 * box it shares with the amount input — and every other call site must be
 * untouched by that.
 */
describe("Combo chrome", () => {
  const classes = (el: Element) =>
    el.className.split(/\s+/).filter(Boolean).sort();

  test("classes.input replaces the field box rather than adding to it", async () => {
    const screen = await render(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={countries}
        adornment={() => <span>drawer</span>}
      />
    );
    const combo = screen.getByRole("combobox");
    expect(classes(combo.element())).toEqual(
      ["field-input", "w-full", "h-full", "pr-12"].sort()
    );

    await screen.rerender(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={countries}
        adornment={() => <span>drawer</span>}
        classes={{ input: "w-full text-sm bg-transparent px-4 py-3.5" }}
      />
    );
    expect(classes(combo.element())).toEqual(
      ["w-full", "text-sm", "bg-transparent", "px-4", "py-3.5"].sort()
    );
  });

  test("the popup tracks the control until popup_width says otherwise", async () => {
    const screen = await render(
      <Combo value={undefined} on_change={() => {}} options={countries} />
    );
    await screen.getByRole("combobox").click();
    const popup = screen.getByRole("listbox");
    expect(classes(popup.element())).toContain("w-(--reference-width)");

    await screen.rerender(
      <Combo
        value={undefined}
        on_change={() => {}}
        options={countries}
        popup_width="w-56"
      />
    );
    expect(classes(popup.element())).toContain("w-56");
    expect(classes(popup.element())).not.toContain("w-(--reference-width)");
  });
});
