import type { IAmount } from "./types";

export function format_amount(amount: IAmount): string {
  // usd shown with fixed 2-decimal cents; non-usd denoms keep their pre-rounded
  // precision (crypto amounts must not be forced to 2 decimals).
  const value =
    amount.currency === "USD" ? amount.value.toFixed(2) : `${amount.value}`;
  const primary = `${value} ${amount.currency}`;
  if (amount.currency === "USD") {
    return primary;
  }
  return `${primary} (approx. ${amount.value_usd.toFixed(2)} USD)`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * the span between two iso timestamps, in the largest unit that still reads as
 * a duration a person would say out loud.
 *
 * a template renders the elapsed time rather than the two stamps because the
 * gap is the point — "4 days before the refund" is read at a glance, where two
 * timestamps ask the reader to subtract. rounded down at every unit, so it
 * never overstates the span; anything under a minute, or a `to` that somehow
 * precedes `from`, collapses to the same vague phrase rather than rendering a
 * negative.
 */
export function format_gap(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "less than a minute";

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return plural(mins, "minute");

  const hours = Math.floor(mins / 60);
  if (hours < 48) return plural(hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 60) return plural(days, "day");

  return plural(Math.floor(days / 30), "month");
}
