/** a fund member the settlement pays a share to; receipts go to the same set */
export const is_funded_member = (npo: { active?: boolean }) =>
  npo.active !== false;
