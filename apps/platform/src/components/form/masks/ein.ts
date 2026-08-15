/** us ein: 9 digits displayed `XX-XXXXXXX`. partial input formats as it is
 * typed, so the dash appears the moment a 3rd digit exists. idempotent — a
 * stored bare-digit ein and an already-masked one both come back masked.
 *
 * the field stops at 9: an ein is never longer, so a 10th digit is a typo and
 * refusing it is visible feedback at the keystroke that caused it. the caret
 * simply stops moving rather than the value being trimmed out of sight. */
export function format(digits: string): string {
  const d = digits.replace(/[^0-9]/g, "").slice(0, 9);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function unmask(masked: string): string {
  return masked.replace(/[^0-9]/g, "");
}
