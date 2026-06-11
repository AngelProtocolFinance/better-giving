import type { ActionFunction } from "react-router";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import type { IBalanceTx } from "@/balance-txs";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import { nav_log_append, nav_ltd } from "$/pg/queries/nav";
import { npo_balance_adj, npo_get } from "$/pg/queries/npo";
import { type Schema, type Source, schema } from "./types";

type TRedirects = { [S in Source]: string };

export const transfer_action =
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

    interface Common
      extends Pick<IBalanceTx, "date_created" | "date_updated" | "npo_id"> {}
    const common: Common = {
      date_created: timestamp,
      date_updated: timestamp,
      npo_id: id,
    };

    const units = +fv.amount / ltd.price;
    if (fv.source === "lock") {
      const tx: IBalanceTx = {
        ...common,
        id: from_id,
        status: "pending",
        account: "lock",
        bal_begin: bal_lock_units,
        bal_end: bal_lock_units - units,
        amount: +fv.amount,
        amount_units: units,
        account_other_id: to_id,
        account_other: "liq",
        account_other_bal_begin: bal_liq,
        account_other_bal_end: bal_liq + +fv.amount,
      };
      await db.transaction(async (pg) => {
        await bal_tx_put(pg, tx);
        await npo_balance_adj(pg, id, { lock_units: -units });
      });
    }

    if (fv.source === "liq") {
      const tx: IBalanceTx = {
        ...common,
        id: from_id,
        status: "final",
        account: "liq",
        bal_begin: bal_liq,
        bal_end: bal_liq - +fv.amount,
        amount: +fv.amount,
        amount_units: +fv.amount,
        account_other_id: to_id,
        account_other: "lock",
        account_other_bal_begin: bal_lock_units,
        account_other_bal_end: bal_lock_units + units,
      };
      const lock_tx: IBalanceTx = {
        ...common,
        id: to_id,
        status: "final",
        account: "lock",
        bal_begin: bal_lock_units,
        bal_end: bal_lock_units + units,
        amount: +fv.amount,
        amount_units: units,
        account_other_id: from_id,
        account_other: "liq",
        account_other_bal_begin: bal_liq,
        account_other_bal_end: bal_liq - +fv.amount,
      };

      await db.transaction(async (pg) => {
        await bal_tx_put(pg, tx);
        await bal_tx_put(pg, lock_tx);
        await npo_balance_adj(pg, id, {
          liq: -+fv.amount,
          lock_units: units,
        });
        // new investments are allocated to cash portion and rebalanced later
        await nav_log_append(pg, {
          reason: `npo:${id} transfer allocation from liq to lock`,
          date: timestamp,
          cash_delta: +fv.amount,
          holder_deltas: [{ npo_id: id, units_delta: units }],
        });
      });
    }

    return redirectWithSuccess(redirects[fv.source], "Transfer submitted");
  };
