export interface IAddr {
  street?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

/** fees further applied on settled amount */
export interface IDistFees {
  base: number;
  fsa: number;
}

export interface IFees extends IDistFees {
  processing: number;
}

export interface IBalanceDeltas {
  liq: number;
  lock: number;
  lock_units: number;
  cash: number;
  /** @deprecated kept for reading legacy reversal records */
  tip?: number;
  /** @deprecated kept for reading legacy reversal records */
  fees?: IFees;
}
