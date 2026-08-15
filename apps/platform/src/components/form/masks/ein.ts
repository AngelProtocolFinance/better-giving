/** us ein: 9 digits displayed `XX-XXXXXXX`. partial input formats as it is
 * typed, so the dash appears the moment a 3rd digit exists. idempotent — a
 * stored bare-digit ein and an already-masked one both come back masked.
 *
 * over-length input is dashed and kept whole rather than truncated: a
 * silently-shortened ein passes `/^\d{9}$/` and gets written as one the
 * applicant never typed, so the extra digits have to survive to be rejected. */
export function format(digits: string): string {
  const d = digits.replace(/[^0-9]/g, "");
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function unmask(masked: string): string {
  return masked.replace(/[^0-9]/g, "");
}
