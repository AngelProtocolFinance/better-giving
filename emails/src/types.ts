export interface IAmount {
  /** already rounded */
  value: number;
  currency: string;
  value_usd: number;
}

export interface IDonor {
  first_name: string;
  full_name: string;
  address?: string;
}

export interface IDonation {
  id: string;
  date: string; // pretty-utc
  amount: IAmount;
  to_name: string;
  program_name?: string;
}
