/**
 * `expiration` is read as its UTC calendar date; the fund stays open until that
 * date has ended everywhere on earth — midnight after it in UTC−12, i.e. 12:00 UTC
 * the next day. The fund-list SQL in `.server/pg/queries/fund.ts` applies the same rule.
 */
export const fund_closes_at = (expiration: string): Date => {
  const d = new Date(expiration);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 12)
  );
};

export const fund_is_open = (
  fund: { active: boolean; expiration?: string | null },
  now: Date
): boolean => {
  if (!fund.active) return false;
  if (!fund.expiration) return true;
  return now.getTime() < fund_closes_at(fund.expiration).getTime();
};
