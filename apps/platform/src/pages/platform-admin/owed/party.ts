import type { IOwedRow, TOwedParty } from "./types";

export const party_kind: Record<TOwedParty, string> = {
  npo: "Nonprofit",
  referrer: "Referrer",
};

type TPartyCols = Pick<IOwedRow, "npo_id" | "referrer_user" | "referrer_npo">;

/** the npo id, or the referral code the referrer is known by */
const party_id = (r: TPartyCols): string =>
  r.npo_id != null
    ? String(r.npo_id)
    : (r.referrer_user ?? r.referrer_npo ?? "");

export const party_name = (r: TPartyCols & Pick<IOwedRow, "party_name">) =>
  r.party_name ?? party_id(r);
