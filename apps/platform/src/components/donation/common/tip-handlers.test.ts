import { describe, expect, test, vi } from "vitest";
import type { TTipFormat } from "../types";
import { tip_handlers } from "./tip-handlers";

const setup = (opts?: { amount?: number; format?: TTipFormat }) => {
  const amount = opts?.amount ?? 100;
  const onChange = vi.fn();
  const set_value = vi.fn();
  const set_focus = vi.fn();
  const format = { value: opts?.format ?? ("none" as TTipFormat), onChange };

  const handlers = tip_handlers({
    format,
    set_value,
    set_focus,
    str: (pct) => (amount ? ((pct / 100) * amount).toFixed(2) : ""),
  });

  return { ...handlers, onChange, set_value, set_focus };
};

describe("tip_handlers", () => {
  test("switching the tip on selects a percentage and leaves the string empty", () => {
    const t = setup();

    t.checked_changed(true);

    // "" is the correct value on a percentage format, not a missing one:
    // `tip_val` derives `pct * amount` and never reads the string.
    expect(t.onChange).toHaveBeenCalledWith("15");
    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("switching the tip off clears both", () => {
    const t = setup();

    t.checked_changed(false);

    expect(t.onChange).toHaveBeenCalledWith("none");
    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("picking a percentage clears the string rather than storing one", async () => {
    const t = setup();

    await t.tip_format_changed("20");

    // a percentage-derived string stored here is unreadable by construction
    // and goes stale as soon as the amount changes — nothing recomputes it.
    expect(t.onChange).toHaveBeenCalledWith("20");
    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("picking none clears the string", async () => {
    const t = setup();

    await t.tip_format_changed("none");

    expect(t.set_value).toHaveBeenCalledWith("");
  });

  test("picking custom seeds the field from the percentage being left", async () => {
    const t = setup({ format: "20" });

    await t.tip_format_changed("custom");

    // computed at the moment the string starts being read, so it reflects the
    // amount as it stands now
    expect(t.set_value).toHaveBeenCalledWith("20.00");
    expect(t.set_focus).toHaveBeenCalledOnce();
  });

  test("picking custom from no tip at all seeds nothing", async () => {
    const t = setup({ format: "none" });

    await t.tip_format_changed("custom");

    expect(t.set_value).toHaveBeenCalledWith("");
    expect(t.set_focus).toHaveBeenCalledOnce();
  });

  test("picking custom before an amount is entered seeds nothing", async () => {
    const t = setup({ amount: 0, format: "15" });

    await t.tip_format_changed("custom");

    // there is no amount to take a percentage of, so there is nothing to seed
    expect(t.set_value).toHaveBeenCalledWith("");
    expect(t.set_focus).toHaveBeenCalledOnce();
  });
});
