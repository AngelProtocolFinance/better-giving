import { via_name } from "../donations/helpers";
import type { TFrequency } from "../schemas";

/**
 * the new-donation trigger's public contract: every key is a field a Zap maps.
 * the live hook and the sample list both serialize through `new_donation_item`,
 * so a field can't reach one without the other.
 */
export interface INewDonationItem {
  id: string;
  date: string;
  recipient_id: number;
  recipient_name: string;
  amount: number;
  amount_usd: number;
  currency: string;
  donor_name: string;
  donor_email: string;
  donor_company?: string;
  program_id?: string;
  program_name?: string;
  payment_method: string;
  frequency: TFrequency;
  is_recurring: boolean;
  form_id?: string;
  form_tag?: string;
}

/** one npo's share of a donation: the dist row, or the don-dist message for it */
export interface INewDonationSource {
  id: string;
  date: string;
  to_id: number;
  to_name: string;
  amount: number;
  amount_usd: number;
  currency: string;
  frequency: TFrequency;
  via: string;
  from_email: string;
  from_name?: string | null;
  from_company?: string | null;
  program_id?: string | null;
  program_name?: string | null;
  form_id?: string | null;
  form_tag?: string | null;
}

export function new_donation_item(s: INewDonationSource): INewDonationItem {
  const item: INewDonationItem = {
    id: s.id,
    date: s.date,
    recipient_id: s.to_id,
    recipient_name: s.to_name,
    amount: s.amount,
    amount_usd: s.amount_usd,
    currency: s.currency,
    donor_name: s.from_name || "Anonymous",
    donor_email: s.from_email,
    payment_method: via_name(s.via),
    frequency: s.frequency,
    is_recurring: s.frequency !== "one-time",
  };
  // optional keys are left off, not nulled: zapier shows an absent key as unset
  if (s.from_company) item.donor_company = s.from_company;
  if (s.program_id) item.program_id = s.program_id;
  if (s.program_name) item.program_name = s.program_name;
  if (s.form_id) item.form_id = s.form_id;
  if (s.form_tag) item.form_tag = s.form_tag;
  return item;
}
