import type { ActionFunction } from "react-router";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import type { IBalanceTx } from "@/balance-txs";
import { resp } from "@/helpers/https";
import type { IPayout } from "@/payouts";
import { db } from "$/pg/db";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import { nav_ltd } from "$/pg/queries/nav";
import { npo_balance_adj, npo_get } from "$/pg/queries/npo";
import { payout_put } from "$/pg/queries/payout";
import { type Schema, type Source, schema } from "./types";

type TRedirects = { [S in Source]: string };

export const withdraw_action =
  (redirects: TRedirects): ActionFunction =>
  async (x) => {
    const id = x.context.get(admin_ctx);

    const [npo, ltd] = await Promise.all([npo_get(id), nav_ltd()]);
    const bal_liq = npo?.liq ?? 0;
    const bal_lock_units = npo?.lock_units ?? 0;
    const json = await x.request.json();
    const p = safeParse(schema, {
      ...json,
      bals: {
        liq: bal_liq,
        lock: bal_lock_units * ltd.price,
      },
    } satisfies Schema);
    if (p.issues) return resp.status(400, p.issues[0].message);
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

      await db.transaction(async (pg) => {
        await bal_tx_put(pg, tx);
        await npo_balance_adj(pg, id, { lock_units: -units });
      });
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

      await db.transaction(async (pg) => {
        await bal_tx_put(pg, tx);
        await npo_balance_adj(pg, id, { liq: -+fv.amount, cash: +fv.amount });
        await payout_put(pg, payout);
      });
    }

    return redirectWithSuccess(redirects[fv.source], "Withdrawal submitted");
  };
