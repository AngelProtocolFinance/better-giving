import { type ActionFunctionArgs, data } from "react-router";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import type { IBalanceTx } from "@/balance-txs";
import type { IPayout } from "@/payouts";
import { db } from "$/pg/db";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import { nav_ltd } from "$/pg/queries/nav";
import { npo_balance_adj, npo_get_locked } from "$/pg/queries/npo";
import { payout_put } from "$/pg/queries/payout";
import { type Schema, type Source, schema } from "./types";

type TRedirects = { [S in Source]: string };
type Outcome = { refusal: string } | { source: Source };

export const withdraw_action =
  (redirects: TRedirects) => async (x: ActionFunctionArgs) => {
    const id = x.context.get(admin_ctx);

    const [json, ltd] = await Promise.all([x.request.json(), nav_ltd()]);

    const res: Outcome = await db.transaction(async (pg) => {
      const npo = await npo_get_locked(pg, id);
      const bal_liq = npo?.liq ?? 0;
      const bal_lock_units = npo?.lock_units ?? 0;
      const p = safeParse(schema, {
        ...json,
        bals: {
          liq: bal_liq,
          lock: bal_lock_units * ltd.price,
        },
      } satisfies Schema);
      if (p.issues) return { refusal: p.issues[0].message };
      const fv = p.output;

      const timestamp = new Date().toISOString();
      const to_id = crypto.randomUUID();
      const from_id = crypto.randomUUID();

      const common = {
        id: from_id,
        date_created: timestamp,
        date_updated: timestamp,
        npo_id: id,
        account_other_id: to_id,
        account_other: "grant",
        account_other_bal_begin: 0,
        account_other_bal_end: +fv.amount,
      } as IBalanceTx;

      if (fv.source === "lock") {
        const units = +fv.amount / ltd.price;
        const tx: IBalanceTx = {
          ...common,
          status: "pending",
          account: "lock",
          bal_begin: bal_lock_units,
          bal_end: bal_lock_units - units,
          amount: +fv.amount,
          amount_units: units,
        };

        await bal_tx_put(pg, tx);
        await npo_balance_adj(pg, id, { lock_units: -units });
      }

      if (fv.source === "liq") {
        const tx: IBalanceTx = {
          ...common,
          // liq withdrawals create payouts immediately
          status: "final",
          account: "liq",
          bal_begin: bal_liq,
          bal_end: bal_liq - +fv.amount,
          amount: +fv.amount,
          amount_units: +fv.amount,
        };

        // liq withdrawals create payouts immediately
        const payout: IPayout = {
          id: to_id,
          source_id: from_id,
          npo_id: id,
          source: fv.source,
          date: timestamp,
          amount: +fv.amount,
          type: "pending",
        };

        await bal_tx_put(pg, tx);
        await npo_balance_adj(pg, id, { liq: -+fv.amount, cash: +fv.amount });
        await payout_put(pg, payout);
      }

      return { source: fv.source };
    });
    if ("refusal" in res) return data({ error: res.refusal }, { status: 400 });

    return redirectWithSuccess(redirects[res.source], "Withdrawal submitted");
  };
