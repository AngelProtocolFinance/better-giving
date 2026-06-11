import type { grants_schedule } from "@better-giving/react-emails";
import { grants_schedule as gs } from "@better-giving/react-emails";
import { emails } from "@/constants/common";
import { report_error } from "@/errors/report";
import { min_payout_amount } from "@/npo/schema";
import { send_email } from "$/email";
import { wise as wise_env } from "$/env";
import { wise } from "$/kit/wise";
import { npo_get } from "$/pg/queries/npo";
import { pending_payouts } from "$/pg/queries/payout";

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

    const by_npo = Object.groupBy(grants, (g) => g.npo_id);

    const rows: grants_schedule.IData["rows"] = [];
    let total_grant = 0;

    for (const [npo_id, items = []] of Object.entries(by_npo)) {
      const total = items.reduce((acc, cur) => acc + cur.amount, 0);
      const npo = await npo_get(+npo_id);
      if (!npo) {
        console.info(`NPO ${npo_id} not found, skipping`);
        continue;
      }
      const effective_min = npo.payout_minimum ?? min_payout_amount;
      const effect = total >= effective_min ? "pass" : "skipped";
      rows.push({
        id: npo.id,
        name: npo.name,
        amount: total,
        min: effective_min,
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
