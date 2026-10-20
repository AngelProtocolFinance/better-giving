/** `donation_messages.amount` is the gift base in the gift's own currency.
 * `upusd` is how many of those units buy a dollar. the donor feed prints
 * dollars, so a peso base has to be divided before it is shown. nothing
 * back means the feed leaves the figure off. */
export function message_amount_usd(
  amount: number | null | undefined,
  upusd: number | null | undefined
): number | null {
  if (amount == null || upusd == null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isFinite(upusd) || upusd <= 0) return null;
  return amount / upusd;
}
