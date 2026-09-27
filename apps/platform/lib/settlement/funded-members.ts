/** a fund member the settlement picks for a share */
export const is_funded_member = (npo: { active?: boolean }) =>
  npo.active !== false;
