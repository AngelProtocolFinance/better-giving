import { describe, expect, test, vi } from "vitest";
import type { TTipFormat } from "../types";
import { tip_handlers } from "./tip-handlers";

const setup = (opts?: { amount?: number }) => {
  const amount = opts?.amount ?? 100;
  const onChange = vi.fn();
  const set_value = vi.fn();
  const set_focus = vi.fn();
  const format = { value: "none" as TTipFormat, onChange };

  const handlers = tip_handlers({
    format,
    set_value,
    set_focus,
    str: (pct) => (amount ? ((pct / 100) * amount).toFixed(2) : ""),
  });

  return { ...handlers, onChange, set_value, set_focus };
};

describe("tip_handlers", () => {
  test("switching the tip on stores the string as well as the format", () => {
    const t = setup();

    t.checked_changed(true);

    // the bug this exists to prevent: format moved, string left empty. every
    // other path wrote both, so `fv.tip` read as "no tip" on the default
    // tipping path while `tip_val` derived and charged 15%.
    expect(t.onChange).toHaveBeenCalledWith("15");
    expect(t.set_value).toHaveBeenCalledWith("15.00");
  });

  test("switching the tip off clears both", () => {
    const t = setup();

    t.checked_changed(false);

    expect(t.onChange).toHaveBeenCalledWith("none");
    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("picking a percentage stores that percentage of the amount", async () => {
    const t = setup();

    await t.tip_format_changed("20");

    expect(t.onChange).toHaveBeenCalledWith("20");
    expect(t.set_value).toHaveBeenCalledWith("20.00");
  });

  test("picking none clears the string", async () => {
    const t = setup();

    await t.tip_format_changed("none");

    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("picking custom focuses the field and leaves the string alone", async () => {
    const t = setup();

    await t.tip_format_changed("custom");

    // the donor is about to type over it; clearing first makes the field flash
    expect(t.set_focus).toHaveBeenCalledOnce();
    expect(t.set_value).not.toHaveBeenCalled();
  });

  test("switching on before an amount is entered stores nothing", () => {
    const t = setup({ amount: 0 });

    t.checked_changed(true);

    // consistent, not desynced: there is no amount to take a percentage of, so
    // there is no tip for either field to describe yet
    expect(t.onChange).toHaveBeenCalledWith("15");
    expect(t.set_value).toHaveBeenCalledWith("");
  });
});
