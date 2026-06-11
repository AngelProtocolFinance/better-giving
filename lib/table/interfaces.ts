export interface ICurrencyFvMap {
  date_created: string;
  all: Record<string, number>;
}

export type TEquivalent = "USD";

export interface ICountryMetricsTime {
  /** YYWW format e.g. 2047 */
  week_num: number;
}

export interface IApiKey {
  npo_id: number;
  api_key: string;
  timestamp: number;
}

// v2 payload — new keys encrypt this shape
export interface IApiKeyPayload {
  npo_id: number;
  timestamp: number;
}

export interface IDonationMessage {
  id: string;
  donation_id: string;
  recipient_id: string;
  date: string;
  donor_id: string;
  donor_name: string;
  donor_message: string;
  amount: number;
}

export interface ICountryMetrics {
  total_donations_7d: number;
  total_donations: number;
  name: string;
  /** last updated date */
  date: string;
}
