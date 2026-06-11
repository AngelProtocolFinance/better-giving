import crypto from "node:crypto";
import { report_error } from "@/errors/report";
import type { ICommission, IPayout } from "@/referrals";
import { stage } from "$/env";
import { aws_monitor } from "$/kit/discord";
import { db } from "$/pg/db";
import {
  commission_update_status,
  commissions_all_by_status,
  referrer_payout_put,
} from "$/pg/queries/referrer";
import { get_referrer } from "./helpers";
import { send_commission } from "./send-commission";

const lambda = `commissions-processor:${stage}`;

export async function index() {
  try {
    const items = await commissions_all_by_status("pending");

    if (items.length === 0) {
      await aws_monitor.send_alert({
        type: "NOTICE",
        from: lambda,
        title: "No commissions to process",
        body: `No commissions to process for ${stage}`,
      });
      return { statusCode: 200, body: "No commissions to process" };
    }

    const grouped = items.reduce(
      (acc, curr) => {
        const key = (curr.referrer_user ?? curr.referrer_npo)!;
        acc[key] ||= [];
        acc[key].push(curr);
        return acc;
      },
      {} as { [index: string]: ICommission[] }
    );

    for (const [referrer, sources] of Object.entries(grouped)) {
      await process_item(referrer, sources);
    }

    return { statusCode: 200, body: "Done processing commissions" };
  } catch (err) {
    report_error(err);
    return { statusCode: 500, body: "Something went wrong" };
  }
}

async function process_item(ref_id: string, items: ICommission[]) {
  const total = items.reduce((a, b) => a + b.amount, 0);

  const is_npo = ref_id.startsWith("NPO-");
  const payout: IPayout = {
    amount: total,
    date: new Date().toISOString(),
    id: crypto.randomUUID(),
    referrer_user: is_npo ? undefined : ref_id,
    referrer_npo: is_npo ? ref_id : undefined,
  };

  try {
    const ref = await get_referrer(ref_id);
    if (!ref) throw new Error(`referrer:${ref_id} not found`);

    if (!ref.pay_id) {
      return console.info(`referrer:${ref_id} has no payout method`);
    }
    if (total < ref.pay_min) {
      return console.info(
        `referrer:${ref_id} payout ${total} is less than minimum ${ref.pay_min}`
      );
    }

    const res = await send_commission(ref.pay_id, total, payout.id);
    payout.transfer_id = res;

    await db.transaction(async (tx) => {
      for (const item of items) {
        await commission_update_status(tx, item.donation_id, "paid");
      }
      await referrer_payout_put(tx, payout);
    });

    await aws_monitor.send_alert({
      type: "NOTICE",
      from: lambda,
      title: `Commission paid for ${ref_id}`,
      fields: [
        { name: "amount", value: payout.amount.toString() },
        { name: "name", value: ref.name },
        { name: "email", value: ref.email },
      ],
    });
  } catch (err) {
    report_error(err, { ref_id });
    payout.error = "Failed to process commission";
    await referrer_payout_put(db, payout);
  }
}
