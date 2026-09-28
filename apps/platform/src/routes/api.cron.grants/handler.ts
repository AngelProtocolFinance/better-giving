import { report_error } from "#/errors/report";
import { group_by } from "@/helpers/array";
import { min_payout_amount } from "@/npo/schema";
import type { IPayout, IPendingStatus } from "@/payouts";
import { stage } from "$/env";
import { aws_monitor } from "$/kit/discord";
import { settle_npo_payouts } from "$/payouts/settle";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_get } from "$/pg/queries/npo";
import { pending_payouts, processing_payouts } from "$/pg/queries/payout";
import { transfer_grant } from "./transfer-grant";

// optional npo_id to retry a single npo
interface IInput {
  npo_id?: number;
}

const fn = `grants-processor:${stage}`;

export async function index(event?: IInput) {
  try {
    await alert_unsettled_claims();
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

    const by_npo = group_by(grants, (g) => g.npo_id);
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

/**
 * a processing row was claimed and never settled or released: a killed run, a
 * failed release, a transfer whose funding or record is unknown, or a
 * concurrent run still in flight. `pending_payouts` never returns these rows,
 * so without this they sit unpaid and unannounced
 */
async function alert_unsettled_claims() {
  try {
    const stuck = await processing_payouts();
    if (stuck.length === 0) return;
    const by_npo = group_by(stuck, (p) => p.npo_id);
    const lines = Object.entries(by_npo).map(
      ([npo, ps = []]) => `npo:${npo}: ${ps.map((p) => p.id).join(", ")}`
    );
    await aws_monitor.send_alert({
      type: "ERROR",
      from: fn,
      title: "payouts claimed but not settled",
      body: `reconcile in Wise before resetting any to pending\n${lines.join("\n")}`,
    });
  } catch (err) {
    report_error(err);
  }
}

async function process_item(npo_id: number, items: IPayout<IPendingStatus>[]) {
  try {
    const npo = await npo_get(npo_id);
    if (!npo) throw new Error(`npo:${npo_id} not found`);
    if (npo.active === false) {
      console.info(`npo:${npo_id} inactive, skipping payout`);
      return;
    }

    const wise_id = await npo_default_bapp(npo.id).then((x) => x?.id);
    if (!wise_id) {
      console.info(`No wise recipient found for npo:${npo_id}`);
      return;
    }

    // skips the locking claim tx each run for an npo still under its minimum;
    // the settle's locked recheck is the authoritative one
    const snapshot_total = items.reduce((a, b) => a + b.amount, 0);
    const minimum = npo.payout_minimum ?? min_payout_amount;
    if (snapshot_total < minimum) {
      console.info(
        `npo:${npo_id} payout minimum not met, min: ${minimum}, total: ${snapshot_total}`
      );
      return;
    }

    const res = await settle_npo_payouts(
      { id: npo.id, name: npo.name, payout_minimum: minimum },
      items.map((i) => i.id),
      String(wise_id),
      (ref, total) => transfer_grant(+wise_id, total, ref)
    );
    if (res.status !== "settled") {
      console.info(`npo:${npo_id} not paid: ${res.status}`);
      return;
    }

    await aws_monitor.send_alert({
      type: "NOTICE",
      from: fn,
      title: `Grant paid for npo:${npo.id}: ${npo.name}`,
      fields: [
        { name: "amount", value: res.total.toString() },
        { name: "transfer_id", value: res.transfer_id },
        { name: "ref_id", value: res.ref },
      ],
    });
  } catch (err) {
    report_error(err, { npo_id });
  }
}
