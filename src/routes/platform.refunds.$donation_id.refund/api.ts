import { dataWithSuccess } from "#/.server/toast";
import { str_id } from "#/helpers/stripe";
import type { IBalanceTx } from "@/balance-txs";
import { report_error } from "@/errors/report";
import { humanize } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import type { IRefundedLossStatus, IRefundedStatus } from "@/payouts";
import * as sub_deactivated from "@/queue/msgs/sub-deactivated";
import type { ILossLog } from "@/revenue";
import type { IBalanceDeltas } from "@/types/donation";
import { stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { bal_tx_put } from "$/pg/queries/bal-tx";
import {
  type DistRefundGraph,
  dist_refund_update,
  dists_for_refund,
} from "$/pg/queries/dist";
import {
  donation_get,
  donation_settlement_get,
  donation_update,
} from "$/pg/queries/donation";
import { donation_message_del } from "$/pg/queries/donation-message";
import { form_ltd_inc } from "$/pg/queries/form";
import { nav_log_append, nav_ltd } from "$/pg/queries/nav";
import { npo_balance_update, npo_get } from "$/pg/queries/npo";
import { payout_update } from "$/pg/queries/payout";
import { npo_prog_contrib } from "$/pg/queries/program";
import { commission_update_status } from "$/pg/queries/referrer";
import { loss_log_put, rev_log_update_status } from "$/pg/queries/revenue";
import { sub_update } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";

export interface PreviewLine {
  label: string;
  pass: boolean;
  reason?: string;
}

export interface DistPreview {
  id: string;
  npo_id: number;
  npo_name: string;
  amount: number;
  net: number;
  refund_status: string | null;
  refund_error?: string | null;
  /** what will happen when the refund is processed */
  effects: PreviewLine[];
  /** blockers preventing the refund from proceeding */
  blockers: PreviewLine[];
  /** non-reversible items — refund proceeds, platform absorbs loss */
  warnings: PreviewLine[];
}

export interface LoaderData {
  donation_id: string;
  already_refunded: boolean;
  previews: DistPreview[];
  /** total amount platform will absorb as loss */
  total_loss: number;
  /** stripe subscription id if payment originated from a subscription */
  subscription_id: string | null;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { donation_id } = params;

  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });

  const already_refunded =
    don.status === "refunded" || don.status === "refunded_loss";
  const graphs = await dists_for_refund(donation_id);

  // resolve subscription from stripe intent if available
  let subscription_id: string | null = null;
  const sttl = await donation_settlement_get(donation_id);
  if (sttl?.sttl_id) {
    try {
      const { data: ips } = await stripe.invoicePayments.list({
        payment: { payment_intent: sttl.sttl_id, type: "payment_intent" },
        expand: ["data.invoice"],
      });
      const inv = ips[0]?.invoice;
      const invoice =
        inv && typeof inv !== "string" && !inv.deleted ? inv : null;
      const sub = invoice?.parent?.subscription_details?.subscription;
      subscription_id = sub ? str_id(sub) : null;
    } catch {
      // stripe lookup failure is non-blocking for preview
    }
  }

  const previews: DistPreview[] = [];
  for (const g of graphs) {
    const preview = await build_preview(g, subscription_id);
    previews.push(preview);
  }

  const total_loss = previews.reduce(
    (sum, p) => sum + (p.warnings.length > 0 ? p.amount : 0),
    0
  );

  return {
    donation_id,
    already_refunded,
    previews,
    total_loss,
    subscription_id,
  } satisfies LoaderData;
};

async function build_preview(
  g: DistRefundGraph,
  subscription_id: string | null
): Promise<DistPreview> {
  const { dist } = g;
  const npo_id = dist.to_id ?? 0;
  const net = dist.net ?? 0;
  const alloc = dist.alloc ?? { liq: 0, lock: 0, cash: 0 };

  const effects: PreviewLine[] = [];
  const blockers: PreviewLine[] = [];
  const warnings: PreviewLine[] = [];

  // already processed — show status only
  if (dist.refund_status === "completed" || dist.refund_status === "loss") {
    effects.push({
      label:
        dist.refund_status === "loss"
          ? "Completed with losses"
          : "Already completed",
      pass: true,
    });
    return {
      id: dist.id,
      npo_id,
      npo_name: dist.to_name ?? "",
      amount: dist.amount ?? 0,
      net,
      refund_status: dist.refund_status,
      effects,
      blockers,
      warnings,
    };
  }
  if (dist.refund_status === "failed") {
    blockers.push({
      label: "Previously failed",
      pass: false,
      reason: dist.refund_error ?? "unknown",
    });
    return {
      id: dist.id,
      npo_id,
      npo_name: dist.to_name ?? "",
      amount: dist.amount ?? 0,
      net,
      refund_status: dist.refund_status,
      refund_error: dist.refund_error,
      effects,
      blockers,
      warnings,
    };
  }

  // derive balance deltas from allocation percentages
  const bd = {
    liq: (alloc.liq / 100) * net,
    lock: (alloc.lock / 100) * net,
    cash: (alloc.cash / 100) * net,
  };

  const needs_nav = bd.lock > 0;
  const [npo_item, nav] = await Promise.all([
    npo_get(npo_id),
    needs_nav ? nav_ltd() : undefined,
  ]);
  const bal = {
    liq: npo_item?.liq ?? 0,
    lock_units: npo_item?.lock_units ?? 0,
    cash: npo_item?.cash ?? 0,
  };

  // recompute lock_units at current NAV price
  const refund_lock_units = nav ? bd.lock / nav.price : 0;

  if (bd.liq > 0) {
    const ok = bal.liq >= bd.liq;
    if (ok) {
      effects.push({
        label: "Savings balance",
        pass: true,
        reason: `$${humanize(bd.liq)} will be deducted`,
      });
    } else {
      warnings.push({
        label: "Savings balance",
        pass: false,
        reason: `has $${humanize(bal.liq)}, need $${humanize(bd.liq)}`,
      });
    }
  }
  if (bd.lock > 0) {
    const ok = bal.lock_units >= refund_lock_units;
    if (ok) {
      effects.push({
        label: "Investment balance",
        pass: true,
        reason: `$${humanize(bd.lock)} will be redeemed`,
      });
    } else {
      warnings.push({
        label: "Investment balance",
        pass: false,
        reason: `has ${humanize(bal.lock_units)}u, need ${humanize(refund_lock_units)}u`,
      });
    }
  }
  if (bd.cash > 0 && g.payout) {
    const ok = g.payout.type === "pending";
    if (ok) {
      effects.push({
        label: "Grant payout",
        pass: true,
        reason: `$${humanize(bd.cash)} pending payout will be cancelled`,
      });
    } else {
      warnings.push({
        label: "Grant payout",
        pass: false,
        reason: `$${humanize(bd.cash)} payout is ${g.payout.type ?? "missing"}, cannot reverse`,
      });
    }
  }

  // commission reversal — always reversed when present
  if (g.commission) {
    effects.push({
      label: "Commission",
      pass: true,
      reason: `$${humanize(g.commission.amount ?? 0)} will be reversed`,
    });
  }

  if (subscription_id) {
    effects.push({
      label: "Subscription",
      pass: true,
      reason: "will be cancelled",
    });
  }

  if (effects.length === 0 && warnings.length === 0 && blockers.length === 0) {
    effects.push({ label: "No balance changes", pass: true });
  }

  return {
    id: dist.id,
    npo_id,
    npo_name: dist.to_name ?? "",
    amount: dist.amount ?? 0,
    net,
    refund_status: dist.refund_status,
    effects,
    blockers,
    warnings,
  };
}

// -- action: apply all PG reversals then issue stripe refund --

export const action = async ({ params }: Route.ActionArgs) => {
  const { donation_id } = params;

  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });
  if (don.status === "refunded" || don.status === "refunded_loss")
    throw new Response("already refunded", { status: 400 });

  const graphs = await dists_for_refund(donation_id);
  if (graphs.length === 0)
    throw new Response("no settled dists", { status: 400 });

  // resolve stripe intent from settlement
  const sttl = await donation_settlement_get(donation_id);
  const intent_id = sttl?.sttl_id ?? null;

  // resolve subscription
  let sub_id: string | null = null;
  if (intent_id) {
    try {
      const { data: ips } = await stripe.invoicePayments.list({
        payment: { payment_intent: intent_id, type: "payment_intent" },
        expand: ["data.invoice"],
      });
      const inv = ips[0]?.invoice;
      const invoice =
        inv && typeof inv !== "string" && !inv.deleted ? inv : null;
      const sub = invoice?.parent?.subscription_details?.subscription;
      sub_id = sub ? str_id(sub) : null;
    } catch {
      // non-blocking
    }
  }

  // apply PG reversals
  const failures: string[] = [];
  const loss_msgs: string[] = [];

  for (const g of graphs) {
    try {
      const loss = await apply_refund(
        g,
        don.form_id ?? null,
        don.program?.id ?? null
      );
      const status = loss ? "loss" : "completed";
      await dist_refund_update(db, g.dist.id, { refund_status: status });

      if (loss) {
        loss_msgs.push(`npo ${g.dist.to_id}: $${loss.amount} — ${loss.reason}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await dist_refund_update(db, g.dist.id, {
        refund_status: "failed",
        refund_error: msg,
      }).catch((e) => report_error(e, { dist_id: g.dist.id }));
      failures.push(`dist ${g.dist.id}: ${msg}`);
      report_error(err, { dist_id: g.dist.id, donation_id });
    }
  }

  const has_loss = loss_msgs.length > 0;
  await donation_update(db, donation_id, {
    status: has_loss ? "refunded_loss" : "refunded",
  });

  // stripe refund
  if (intent_id) {
    await stripe.refunds.create({ payment_intent: intent_id });
  }

  // cancel subscription
  if (sub_id) {
    const { row, prev_status } = await sub_update(db, sub_id, {
      status: "inactive",
      status_cancel_reason: "refunded",
      updated_at: new Date().toISOString(),
    });
    if (row && prev_status === "active") {
      await enqueue(sub_deactivated.to_msg(row));
    }
  }

  // losses are finance-ops notices — keep discord. failures already routed to sentry.
  if (loss_msgs.length > 0) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `refund-action-${stage}`,
      title: "Refund Completed with Losses",
      body: `LOSSES:\n${loss_msgs.join("\n")}`,
    });
  }

  return dataWithSuccess({ ok: true }, "Refund processed");
};

/** returns loss if any pre-flight check fails; undefined = full reversal */
async function apply_refund(
  g: DistRefundGraph,
  form_id: string | null,
  program_id: string | null
): Promise<ILossLog | undefined> {
  const { dist } = g;
  const npo_id = dist.to_id ?? 0;

  const alloc = dist.alloc ?? { liq: 0, lock: 0, cash: 0 };
  const net = dist.net ?? 0;
  const balance_deltas: IBalanceDeltas = {
    liq: (alloc.liq / 100) * net,
    lock: (alloc.lock / 100) * net,
    lock_units: 0,
    cash: (alloc.cash / 100) * net,
  };

  const needs_nav = balance_deltas.lock > 0;
  const [npo_item, nav] = await Promise.all([
    npo_get(npo_id),
    needs_nav ? nav_ltd() : undefined,
  ]);
  if (!npo_item) throw resp.status(404, `npo:${npo_id} not found`);
  const bal = {
    liq: npo_item.liq ?? 0,
    lock_units: npo_item.lock_units ?? 0,
    cash: npo_item.cash ?? 0,
  };

  const refund_lock_units = nav ? balance_deltas.lock / nav.price : 0;
  const refund_deltas = { ...balance_deltas, lock_units: refund_lock_units };

  const check_reasons: string[] = [];
  if (balance_deltas.liq > 0 && bal.liq < balance_deltas.liq) {
    check_reasons.push(`liq: has $${bal.liq}, need $${balance_deltas.liq}`);
  }
  if (balance_deltas.lock > 0 && bal.lock_units < refund_lock_units) {
    check_reasons.push(
      `lock: has ${bal.lock_units}u, need ${refund_lock_units}u`
    );
  }
  if (balance_deltas.cash > 0 && g.payout) {
    if (g.payout.type !== "pending") {
      check_reasons.push(
        `payout ${g.payout.id} is ${g.payout.type ?? "missing"}`
      );
    }
  }

  const is_loss = check_reasons.length > 0;
  const now = new Date().toISOString();

  let loss: ILossLog | undefined;

  await db.transaction(async (tx) => {
    if (!is_loss) {
      await npo_balance_update(tx, npo_id, refund_deltas, "dec");

      if (balance_deltas.liq > 0) {
        const liq_tx: IBalanceTx = {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: npo_id,
          account: "liq",
          bal_begin: bal.liq,
          bal_end: bal.liq - balance_deltas.liq,
          amount: balance_deltas.liq,
          amount_units: balance_deltas.liq,
          status: "final",
          account_other_id: dist.id,
          account_other: "refund",
          account_other_bal_begin: 0,
          account_other_bal_end: balance_deltas.liq,
        };
        await bal_tx_put(tx, liq_tx);
      }

      if (balance_deltas.lock > 0 && nav) {
        const lock_usd = refund_lock_units * nav.price;
        const lock_tx: IBalanceTx = {
          id: crypto.randomUUID(),
          date_created: now,
          date_updated: now,
          npo_id: npo_id,
          account: "lock",
          bal_begin: bal.lock_units,
          bal_end: bal.lock_units - refund_lock_units,
          amount: lock_usd,
          amount_units: refund_lock_units,
          status: "final",
          account_other_id: dist.id,
          account_other: "refund",
          account_other_bal_begin: 0,
          account_other_bal_end: lock_usd,
        };
        await bal_tx_put(tx, lock_tx);
      }

      if (g.payout) {
        await payout_update(tx, g.payout.id, {
          type: "refunded",
        } as IRefundedStatus);
      }

      if (nav) {
        await nav_log_append(tx, {
          reason: `refund npo:${npo_id}`,
          date: now,
          cash_delta: -balance_deltas.lock,
          holder_deltas: [{ npo_id, units_delta: -refund_lock_units }],
        });
      }
    }

    const refund_status = is_loss ? "refunded_loss" : "refunded";

    for (const rl of g.rev_logs) {
      await rev_log_update_status(tx, rl.id, refund_status);
    }

    if (g.commission) {
      await commission_update_status(
        tx,
        g.commission.donation_id,
        refund_status
      );
    }

    if (form_id) await form_ltd_inc(tx, form_id, -net, -1);
    if (program_id) await npo_prog_contrib(tx, program_id, -net);

    await donation_message_del(tx, dist.donation_id);

    if (is_loss && g.payout) {
      await payout_update(tx, g.payout.id, {
        type: "refunded_loss",
      } as IRefundedLossStatus);
    }

    if (is_loss) {
      loss = {
        id: crypto.randomUUID(),
        date: now,
        donation_id: dist.donation_id,
        dist_id: dist.id,
        npo_id: npo_id,
        type: check_reasons[0].startsWith("liq")
          ? "balance_liq"
          : check_reasons[0].startsWith("lock")
            ? "balance_lock"
            : "payout",
        amount: dist.amount ?? 0,
        npo_amount: net,
        fees_bg: (dist.fee_base ?? 0) + (dist.fee_fsa ?? 0),
        fees_processing: dist.fee_processing ?? 0,
        reason: check_reasons.join("; "),
      };
      await loss_log_put(tx, loss);
    }
  });

  return loss;
}
