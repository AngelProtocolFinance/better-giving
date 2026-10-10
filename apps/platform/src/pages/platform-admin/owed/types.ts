export type TOwedParty = "npo" | "referrer";
export type TOwedPartyFilter = "all" | TOwedParty;
export type TOwedSort = "date" | "outstanding";
export type TSortDir = "asc" | "desc";

/** one row of the amounts-owed list, as the loader serializes `IOwedListItem` */
export interface IOwedRow {
  id: string;
  donation_id: string;
  /** exactly one of the three: whose debt it is */
  npo_id: number | null;
  referrer_user: string | null;
  referrer_npo: string | null;
  party: TOwedParty;
  /** the npo's name, or the referrer's: a user's or an npo's */
  party_name: string | null;
  source: "refund" | "dispute";
  /** the provider's refund or dispute id */
  source_ref: string;
  /** iso timestamp */
  recorded_at: string;
  received_usd: number;
  fee_processing_usd: number;
  fee_dispute_usd: number;
  credited_back_usd: number;
  recovered_usd: number;
  outstanding_usd: number;
}
