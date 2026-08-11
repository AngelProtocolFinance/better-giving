import type { TTipFormat } from "../types";

// the format the switch turns on with
const ON_FORMAT = "15" satisfies TTipFormat;

// beat before focusing the custom input, so the field it focuses has mounted
const CUSTOM_FOCUS_DELAY = 50;

interface Params {
  format: { value: TTipFormat; onChange: (format: TTipFormat) => void };
  set_value: (tip: string) => void;
  set_focus: () => void;
  /**
   * `tip` for `pct`% of the amount currently in the form, in the form's own
   * unit — "" when there is no amount to take a percentage of yet. the only
   * part of this that differs per rail: crypto counts token units at the
   * token's precision, the fiat rails count currency at the currency's rate.
   *
   * only ever called at the moment `custom` is picked, to seed the field the
   * donor is about to edit.
   */
  str: (pct: number) => string;
}

/**
 * `tip` holds a tip **only** when `tip_format` is `custom`. on a percentage
 * format the amount is derived — `tip_val` computes `pct * amount` and never
 * reads the string, `is_tip_valid` requires a positive one only for `custom`,
 * and `tip_from_val` deliberately pairs a recognised percentage with `""`. so
 * `""` is the correct value there, not a missing one.
 *
 * that is why the string is written at exactly one moment: when `custom` is
 * picked. it is computed then, from the amount then, because that is the
 * instant it starts being read. a percentage-derived string stored any earlier
 * is unreadable by construction and goes stale the moment the donor edits the
 * amount, token or currency — nothing recomputes it.
 *
 * shared across the six rails so one choice reaches the form as one state, no
 * matter which control the donor used to make it.
 */
export function tip_handlers(p: Params) {
  const checked_changed = (checked: boolean) => {
    p.format.onChange(checked ? ON_FORMAT : "none");
    p.set_value("");
  };

  const tip_format_changed = async (format: TTipFormat) => {
    const prev = p.format.value;
    p.format.onChange(format);
    if (format !== "custom") return p.set_value("");

    // seed the field from the percentage the donor is leaving, so the number
    // they were about to give doesn't vanish when they go to adjust it. NaN
    // when `prev` is `none`/`custom` rather than a percentage.
    const pct = +prev;
    p.set_value(Number.isNaN(pct) ? "" : p.str(pct));

    await new Promise((r) => setTimeout(r, CUSTOM_FOCUS_DELAY));
    p.set_focus();
  };

  return { checked_changed, tip_format_changed };
}
