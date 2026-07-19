import { safeParse } from "valibot";
import { npo_dividend_comps } from "#/.server/npos-dividend-comps";
import { redirectWithSuccess } from "#/.server/toast";
import { credit_txs } from "#/pages/platform-admin/investments/credit-txs";
import { report_error } from "@/errors/report";
import { rd } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import { dividend_log_fv } from "@/nav/schemas";
import { db } from "$/pg/db";
import { dividend_log_put, nav_log_append, nav_ltd } from "$/pg/queries/nav";
import { npos_batch_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export const action = async ({ request }: Route.ActionArgs) => {
  /** exclude: use server side time */
  const p = safeParse(dividend_log_fv, await request.json());
  if (p.issues) return resp.status(400, p.issues[0].message);
  const { date, ...fv } = p.output;

  const nav = await nav_ltd();
  const { per_npo_units, purchased_units } = await npo_dividend_comps(
    +fv.total,
    nav
  );

  const div_date = new Date().toISOString();

  // filter out inactive npos
  const all_npo_ids = Object.keys(per_npo_units).map(Number);
  const all_npos_data = await npos_batch_get(all_npo_ids);
  const inactive = new Set(
    all_npos_data.filter((n) => n.active === false).map((n) => n.id.toString())
  );
  const npos = Object.keys(per_npo_units).filter((id) => !inactive.has(id));

  // log with only active npos
  const active_per_npo_units = Object.fromEntries(
    Object.entries(per_npo_units).filter(([id]) => !inactive.has(id))
  );
  const div_id = crypto.randomUUID();
  await dividend_log_put(db, {
    amount_units: purchased_units,
    amount_usd: +fv.total,
    date_created: div_date,
    per_npo_units: active_per_npo_units,
    id: div_id,
  });

  type TCredit = { units: number; usd: number };
  const per_npo_credited_usd: [string, TCredit][] = [];
  for (const npo of npos) {
    const bu = nav.holders[npo];
    const u = per_npo_units[npo];
    const to_credit_usd = u * nav.price;

    const ok = await db
      .transaction(async (tx) => {
        await credit_txs(tx, {
          ticker: fv.ticker,
          npo: +npo,
          npo_units_bal: bu,
          div_id,
          div_date,
          to_credit_units: u,
          to_credit_usd,
        });
        return true;
      })
      .catch((err) => {
        report_error(err, { npo, units: per_npo_units[npo] });
        return false;
      });

    if (!ok) continue;
    per_npo_credited_usd.push([npo, { units: u, usd: to_credit_usd }]);
    console.info("credited", npo, per_npo_units[npo]);
  }

  if (per_npo_credited_usd.length > 0) {
    let total_credited_usd = 0;
    const holder_deltas = per_npo_credited_usd.map(([npo, credited]) => {
      total_credited_usd += credited.usd;
      return { npo_id: +npo, units_delta: credited.units };
    });

    // dividends are reinvested to cash portion
    await nav_log_append(db, {
      reason: `dividend:${div_id} $${rd(total_credited_usd)} reinvested`,
      date: div_date,
      cash_delta: total_credited_usd,
      holder_deltas,
    }).catch(report_error);
  }

  return redirectWithSuccess("..", "Dividends logged");
};
