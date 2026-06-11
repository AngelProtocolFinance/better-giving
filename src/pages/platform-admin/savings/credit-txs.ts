import type { IBalanceTx } from "@/balance-txs";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import type { DbOrTx } from "$/pg/queries/helpers";
import { npo_balance_adj } from "$/pg/queries/npo";

interface IArgs {
  intr_id: string;
  to_credit: number;
  npo: number;
  npo_bal: number;
  intr_date: string;
}
export async function credit_txs(db: DbOrTx, x: IArgs) {
  await npo_balance_adj(db, +x.npo, { liq: x.to_credit });

  const tx: IBalanceTx = {
    id: crypto.randomUUID(),
    date_created: x.intr_date,
    date_updated: x.intr_date,
    npo_id: x.npo,
    account: "liq",
    amount: x.to_credit,
    amount_units: x.to_credit,
    bal_begin: x.npo_bal,
    bal_end: x.npo_bal + x.to_credit,
    status: "final",

    account_other: "interest",
    account_other_id: x.intr_id,
    account_other_bal_begin: x.to_credit,
    account_other_bal_end: 0,
  };
  await bal_tx_put(db, tx);
}
