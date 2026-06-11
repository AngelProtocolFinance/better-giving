import { Combobox } from "@base-ui/react/combobox";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { TokenCombobox, TokenComboboxSync } from "./token-combobox";

interface Currency {
  code: string;
  label: string;
}

const currencies: Currency[] = [
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
  { code: "GBP", label: "GBP" },
  { code: "CAD", label: "CAD" },
  { code: "AUD", label: "AUD" },
];

const opt_disp = (t: Currency) => (
  <Combobox.Item key={t.code} value={t}>
    {t.label}
  </Combobox.Item>
);

const btn_disp = (open: boolean) => <span>{open ? "▲" : "▼"}</span>;

describe("TokenComboboxSync", () => {
  function setup(value = currencies[0]) {
    const on_change = vi.fn();
    return {
      on_change,
      props: {
        value,
        on_change,
        items: currencies,
        item_key: (t: Currency) => t.code,
        item_label: (t: Currency) => t.label,
        input_placeholder: "Currency",
        btn_disp,
        opt_disp,
      },
    };
  }

  test("select EUR, reopen → all options visible", async () => {
    const { props, on_change } = setup();
    const screen = await render(<TokenComboboxSync {...props} />);

    // open dropdown
    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(5);

    // select EUR
    await screen.getByRole("option", { name: "EUR" }).click();
    expect(on_change).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EUR" })
    );

    // rerender with new value, reopen
    await screen.rerender(
      <TokenComboboxSync {...props} value={currencies[1]} />
    );
    await screen.getByRole("combobox").click();

    // all options should still be visible
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(5);
  });

  test("typing filters options, clearing restores all", async () => {
    const { props } = setup();
    const screen = await render(<TokenComboboxSync {...props} />);

    const combo = screen.getByRole("combobox");
    await combo.click();
    expect(screen.getByRole("option").elements().length).toBe(5);

    // type to filter
    await combo.fill("EU");
    await expect
      .element(screen.getByRole("option", { name: "EUR" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(1);

    // clear filter
    await combo.fill("");
    expect(screen.getByRole("option").elements().length).toBe(5);
  });
});

describe("TokenCombobox (async)", () => {
  function setup(value = currencies[0]) {
    const on_change = vi.fn();
    const on_search =
      vi.fn<(q: string, signal: AbortSignal) => Promise<Currency[]>>();
    // default: return all currencies
    on_search.mockResolvedValue(currencies);

    return {
      on_change,
      on_search,
      props: {
        value,
        on_change,
        on_search,
        item_key: (t: Currency) => t.code,
        item_label: (t: Currency) => t.label,
        input_placeholder: "Search token",
        btn_disp,
        opt_disp,
      },
    };
  }

  test("open → fetches results, select → reopen shows all", async () => {
    const { props, on_change, on_search } = setup();
    const screen = await render(<TokenCombobox {...props} />);

    // open triggers search
    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();
    expect(on_search).toHaveBeenCalledWith("", expect.any(AbortSignal));
    expect(screen.getByRole("option").elements().length).toBe(5);

    // select EUR
    await screen.getByRole("option", { name: "EUR" }).click();
    expect(on_change).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EUR" })
    );

    // rerender with new value, reopen
    on_search.mockClear();
    on_search.mockResolvedValue(currencies);
    await screen.rerender(<TokenCombobox {...props} value={currencies[1]} />);
    await screen.getByRole("combobox").click();

    // should fire a fresh search
    expect(on_search).toHaveBeenCalledWith("", expect.any(AbortSignal));
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements().length).toBe(5);
  });

  test("search query filters, shows 'not found' for no results", async () => {
    const { props, on_search } = setup();
    const screen = await render(<TokenCombobox {...props} />);

    await screen.getByRole("combobox").click();
    await expect
      .element(screen.getByRole("option", { name: "USD" }))
      .toBeVisible();

    // search with no results
    on_search.mockResolvedValue([]);
    await screen.getByRole("combobox").fill("XYZ");

    await expect.element(screen.getByText("XYZ not found")).toBeVisible();
  });

  test("shows 'Searching…' while search is pending", async () => {
    const { props, on_search } = setup();
    // never-resolving promise to keep loading state
    on_search.mockReturnValue(new Promise(() => {}));
    const screen = await render(<TokenCombobox {...props} />);

    await screen.getByRole("combobox").click();

    await expect.element(screen.getByText("Searching…")).toBeVisible();
  });

  test("shows error message on search failure", async () => {
    const { props, on_search } = setup();
    const screen = await render(<TokenCombobox {...props} />);

    on_search.mockRejectedValue(new Error("network"));
    await screen.getByRole("combobox").click();

    await expect
      .element(screen.getByText("Failed to load options"))
      .toBeVisible();
  });
});
