import type { IBalanceTx } from "@/balance-txs";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import type { DbOrTx } from "$/pg/queries/helpers";
import { npo_balance_adj } from "$/pg/queries/npo";

interface IArgs {
  npo: number;
  npo_units_bal: number;
  div_id: string;
  div_date: string;
  ticker: string;
  to_credit_units: number;
  to_credit_usd: number;
  // nav_ltd: ILog;
}
export async function credit_txs(db: DbOrTx, x: IArgs) {
  await npo_balance_adj(db, +x.npo, {
    lock_units: x.to_credit_units,
  });

  const tx: IBalanceTx = {
    id: crypto.randomUUID(),
    date_created: x.div_date,
    date_updated: x.div_date,
    npo_id: x.npo,
    account: "lock",
    amount: x.to_credit_usd,
    amount_units: x.to_credit_units,
    bal_begin: x.npo_units_bal,
    bal_end: x.npo_units_bal + x.to_credit_units,
    status: "final",

    account_other: "dividend",
    account_other_id: x.div_id,
    account_other_bal_begin: x.to_credit_usd,
    account_other_bal_end: 0,
  };
  await bal_tx_put(db, tx);
}
