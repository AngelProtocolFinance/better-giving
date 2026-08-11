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
   */
  str: (pct: number) => string;
}

/**
 * `tip` and `tip_format` are two independently settable fields describing one
 * thing, so every path that moves one has to move the other. shared across the
 * six rails because six copies of that rule is how they drifted: switch-on set
 * the format and left the string empty, and `is_tip_valid` accepts an empty
 * string on a percentage format, so the inconsistent state was reachable on the
 * default tipping path.
 *
 * nothing on screen was wrong, because `tip_val` derives percentage tips from
 * the format and ignores the string. that is exactly what made it dangerous —
 * anything reading `fv.tip` directly saw no tip while a tip was being charged,
 * which is how the crypto summary came to omit a tip the checkout collected.
 */
export function tip_handlers(p: Params) {
  const checked_changed = (checked: boolean) => {
    if (!checked) {
      p.format.onChange("none");
      return p.set_value("");
    }
    p.format.onChange(ON_FORMAT);
    p.set_value(p.str(+ON_FORMAT));
  };

  const tip_format_changed = async (format: TTipFormat) => {
    p.format.onChange(format);
    if (format === "none") return p.set_value("");
    // custom keeps whatever is already there — the donor is about to type over
    // it, and clearing first makes the field flash
    if (format === "custom") {
      await new Promise((r) => setTimeout(r, CUSTOM_FOCUS_DELAY));
      return p.set_focus();
    }
    p.set_value(p.str(+format));
  };

  return { checked_changed, tip_format_changed };
}
