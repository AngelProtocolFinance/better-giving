interface Amount {
  value: number;
  currency: string;
  value_usd: number;
}

export function format_amount(amount: Amount): string {
  const primary = `${amount.value} ${amount.currency}`;
  if (amount.currency === "USD") {
    return primary;
  }
  return `${primary} (approx. ${amount.value_usd} USD)`;
}
