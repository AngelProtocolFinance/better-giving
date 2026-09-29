import type { grants_schedule } from "emails";
import { grants_schedule as gs } from "emails";
import { report_error } from "#/errors/report";
import { emails } from "@/constants/common";
import { group_by } from "@/helpers/array";
import { send_email } from "$/email";
import { wise as wise_env } from "$/env";
import { wise } from "$/kit/wise";
import { pending_payouts } from "$/pg/queries/payout";
import { grant_eligibility } from "./eligibility";

function to_yymm(date: string) {
  const parts = date.split("-");
  return parts[0].substring(2, 4) + parts[1];
}

/**
 * 1 day before the 3-day cycle
 */
export async function index() {
  try {
    const grants = await pending_payouts();
    if (grants.length === 0) {
      console.info("No pending grants to process");
      return;
    }

    const by_npo = group_by(grants, (g) => g.npo_id);

    const rows: grants_schedule.IData["rows"] = [];
    let total_grant = 0;

    for (const [npo_id, items = []] of Object.entries(by_npo)) {
      const total = items.reduce((acc, cur) => acc + cur.amount, 0);
      const el = await grant_eligibility(+npo_id, total);
      if (el.status === "not_found") {
        console.info(`NPO ${npo_id} not found, skipping`);
        continue;
      }
      const effect = el.status === "pass" ? "pass" : "skipped";
      rows.push({
        id: el.npo.id,
        name: el.npo.name,
        amount: total,
        min: el.minimum,
        effect,
      });
      if (effect === "pass") total_grant += total;
    }

    const usd_bal = await wise.balance(
      +wise_env.balance_id_usd,
      +wise_env.profile_id
    );
    const usd_bal_val = usd_bal.totalWorth.value;

    const { node, subject } = gs.template({
      rows,
      total_grant,
      wise_usd_balance: usd_bal_val,
      report_period: to_yymm(new Date().toISOString()),
      low_balance: usd_bal_val < total_grant,
    });

    const res = await send_email({
      node,
      subject,
      to: [emails.tim, emails.chauncey, emails.jms],
    });

    console.info("sent report", res);
  } catch (err) {
    report_error(err);
  }
}
