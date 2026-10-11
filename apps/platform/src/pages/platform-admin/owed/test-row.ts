import type { IOwedRow } from "./types";

/** a nonprofit's refund row owing $93.20 less $40 recovered */
export const owed_row = (o: Partial<IOwedRow> = {}): IOwedRow => ({
  id: "owed-1",
  donation_id: "don-1",
  npo_id: 7,
  referrer_user: null,
  referrer_npo: null,
  party: "npo",
  party_name: "River Trust",
  source: "refund",
  source_ref: "re_123",
  recorded_at: "2026-09-14T10:00:00.000Z",
  received_usd: 90,
  fee_processing_usd: 3.2,
  fee_dispute_usd: 0,
  credited_back_usd: 0,
  recovered_usd: 40,
  outstanding_usd: 53.2,
  ...o,
});
