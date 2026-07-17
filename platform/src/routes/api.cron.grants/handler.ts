import crypto from "node:crypto";
import { report_error } from "@/errors/report";
import type { IPayout, IPendingStatus } from "@/payouts";
import { stage } from "$/env";
import { aws_monitor } from "$/kit/discord";
import { db } from "$/pg/db";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_balance_update, npo_get } from "$/pg/queries/npo";
import type { SettlementRow } from "$/pg/queries/payout";
import {
  payout_update,
  pending_payouts,
  settlement_put,
} from "$/pg/queries/payout";
import { transfer_grant } from "./transfer-grant";

// optional npo_id to retry a single npo
interface IInput {
  npo_id?: number;
}

const fn = `grants-processor:${stage}`;

export async function index(event?: IInput) {
  try {
    const grants = await pending_payouts();

    if (grants.length === 0) {
      await aws_monitor.send_alert({
        type: "NOTICE",
        from: fn,
        title: "No grants to process",
        body: `No grants to process for ${stage}`,
      });
      return { statusCode: 200, body: "No grants to process" };
    }

    const by_npo = Object.groupBy(grants, (g) => g.npo_id);
    const target_npo = event?.npo_id?.toString();

    for (const [npo, items = []] of Object.entries(by_npo).filter(
      ([id]) => !target_npo || id === target_npo
    )) {
      await process_item(+npo, items as IPayout<IPendingStatus>[]);
    }
    return { statusCode: 200, body: "Done processing grants" };
  } catch (err) {
    report_error(err);
    return { statusCode: 500, body: "Something went wrong" };
  }
}

async function process_item(npo_id: number, items: IPayout<IPendingStatus>[]) {
  const payout_date = new Date().toISOString();
  const total = items.reduce((a, b) => a + b.amount, 0);
  const ref_id = crypto.randomUUID();
  try {
    const npo = await npo_get(npo_id);
    if (!npo) throw new Error(`npo:${npo_id} not found`);
    if (npo.active === false) {
      console.info(`npo:${npo_id} inactive, skipping payout`);
      return;
    }
    const effective_min = npo.payout_minimum ?? 50;
    if (effective_min > total) {
      console.info(
        `npo:${npo_id} payout minimum not met, min: ${effective_min}, total: ${total}`
      );
      return;
    }

    const wise_id = await npo_default_bapp(npo.id).then((x) => x?.id);
    if (!wise_id) {
      console.info(`No wise recipient found for npo:${npo_id}`);
      return;
    }

    const transfer_id = await transfer_grant(+wise_id, total, ref_id);

    await db.transaction(async (tx) => {
      // insert settlement before updating payouts to satisfy settled_id FK
      const stlmt: SettlementRow = {
        id: transfer_id.toString(),
        other_id: ref_id,
        npo_id: npo_id,
        date: payout_date,
        amount: total,
        sources: items.map((i) => i.source_id),
        status: "",
      };

      await settlement_put(tx, stlmt);

      for (const item of items) {
        await payout_update(tx, item.id, {
          type: "settled",
          settled_date: payout_date,
          settled_id: transfer_id.toString(),
        } as Partial<Omit<IPayout, "id">>);
      }

      await npo_balance_update(
        tx,
        npo_id,
        { liq: 0, lock: 0, lock_units: 0, cash: total },
        "dec"
      );
    });

    console.info(ref_id);

    await aws_monitor.send_alert({
      type: "NOTICE",
      from: fn,
      title: `Grant paid for npo:${npo.id}: ${npo.name}`,
      fields: [
        { name: "amount", value: total.toString() },
        { name: "transfer_id", value: transfer_id.toString() },
        { name: "ref_id", value: ref_id },
      ],
    });
  } catch (err) {
    report_error(err, { ref_id, npo_id });
  }
}
