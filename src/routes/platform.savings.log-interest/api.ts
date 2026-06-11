import { safeParse } from "valibot";
import { npo_interest_shares } from "#/.server/npos-interest-share";
import { redirectWithSuccess } from "#/.server/toast";
import { credit_txs } from "#/pages/platform-admin/savings/credit-txs";
import { MIN_INTR_TO_CREDIT } from "#/routes/platform/constants";
import { report_error } from "@/errors/report";
import { resp } from "@/helpers/https";
import { interest_log } from "@/liquid/schemas";
import { db } from "$/pg/db";
import { intr_log_put } from "$/pg/queries/liquid";
import { npo_balances_get, npos_batch_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export const action = async ({ request }: Route.ActionArgs) => {
  /** exclude: use server side time */
  const p = safeParse(interest_log, await request.json());
  if (p.issues) return resp.status(400, p.issues[0].message);
  const { date_created, total: raw_total, ...fv } = p.output;
  const total = +raw_total;

  const shares = await npo_interest_shares({
    start: fv.date_start,
    end: fv.date_end,
  });

  const intr_id = crypto.randomUUID();
  const intr_date = new Date().toISOString();

  // filter out inactive npos
  const share_npo_ids = Object.keys(shares).map(Number);
  const share_npos = await npos_batch_get(share_npo_ids);
  const inactive = new Set(
    share_npos.filter((n) => n.active === false).map((n) => n.id.toString())
  );

  const credits: Record<string, number> = {};
  for (const npo in shares) {
    if (inactive.has(npo)) continue;
    const share = shares[npo];
    const to_credit = share * total;
    if (to_credit < MIN_INTR_TO_CREDIT) continue; // skip less than 1 cent
    credits[npo] = to_credit;
  }
  const npos = Object.keys(credits);
  const bals = await npo_balances_get(npos.map(Number));
  const bals_map = bals.reduce(
    (acc, bal) => {
      acc[bal.id] = bal.liq ?? 0;
      return acc;
    },
    {} as Record<string, number>
  );

  await intr_log_put(db, {
    date_start: fv.date_start,
    date_end: fv.date_end,
    total: total,
    date_created: intr_date,
    alloc: Object.fromEntries(
      Object.entries(shares).filter(([id]) => !inactive.has(id))
    ),
    id: intr_id,
  });

  for (const npo of npos) {
    await db
      .transaction(async (tx) => {
        await credit_txs(tx, {
          npo: +npo,
          npo_bal: bals_map[npo] || 0,
          intr_id,
          intr_date,
          to_credit: credits[npo],
        });
      })
      .catch((err) => {
        report_error(err, { npo, credit: credits[npo] });
      });
    console.info("credited", npo, credits[npo]);
  }

  return redirectWithSuccess("..", "Interest logged");
};
