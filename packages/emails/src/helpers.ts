interface Amount {
  value: number;
  currency: string;
  value_usd: number;
}

export function format_amount(amount: Amount): string {
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
