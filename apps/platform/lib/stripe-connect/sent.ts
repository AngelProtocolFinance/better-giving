/** what a routed transfer's reversal records make of it, for the payouts page.
 * `partial.reversed` is usd. `unknown`: stripe could not be read, so the
 * standing is not invented */
export type TSentStanding =
  | { kind: "paid" }
  | { kind: "partial"; reversed: number }
  | { kind: "reversed" }
  | { kind: "unknown" };

export interface ISentTransfer {
  id: string;
  /** usd sent to the connected account */
  amount: number;
  /** when the transfer was created, ISO-8601 */
  date: string;
  standing: TSentStanding;
}

export interface ISentTransfers {
  items: ISentTransfer[];
  /** older routed transfers exist than this list holds */
  truncated: boolean;
}

/**
 * what `reversed` cents of reversal records make of a transfer of `amount`
 * cents. nothing reversed is paid out; the whole amount (or more) is fully
 * reversed; a part is partly reversed, and `reversed` on that result is the
 * reversed usd
 */
export function transfer_standing(
  amount: number,
  reversed: number
): Exclude<TSentStanding, { kind: "unknown" }> {
  if (!(reversed > 0)) return { kind: "paid" };
  if (reversed >= amount) return { kind: "reversed" };
  return { kind: "partial", reversed: reversed / 100 };
}
