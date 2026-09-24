/** compares instants: expiration reads carry 3–6 fraction digits, so iso text doesn't order against `toISOString()` */
export const fund_is_open = (
  fund: { active: boolean; expiration?: string | null },
  now: Date
): boolean => {
  if (!fund.active) return false;
  if (!fund.expiration) return true;
  return Date.parse(fund.expiration) >= now.getTime();
};
