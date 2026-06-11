import type { Referred } from "#/types/referrals";
import { npos_referred_by } from "$/pg/queries/npo";
import { commissions_ltd_get } from "$/pg/queries/referrer";

export const referred_by = async (id: string): Promise<Referred[]> => {
  const ltd = await commissions_ltd_get(id);
  const npos = await npos_referred_by(id);
  return npos.map((i) => ({
    id: i.id,
    name: i.name,
    up_until: i.referrer_expiry ?? "",
    ltd: +(ltd?.[i.id] ?? "0"),
  }));
};
