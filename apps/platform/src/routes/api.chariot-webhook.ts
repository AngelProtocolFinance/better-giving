import crypto from "node:crypto";
import { report_error, report_resp } from "#/errors/report";
import {
  type ChariotMetadata,
  calc_donation_settle,
  type IDonation,
  type IDonationSettled,
  type ISettlement,
  settle_msgs,
  type TStatus,
} from "@/donations";
import { chariot as chariot_env, stage } from "$/env";
import { chariot } from "$/kit/chariot";
import { aws_monitor } from "$/kit/discord";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_has_dists } from "$/pg/queries/dist";
import {
  donation_get,
  donation_settle_state_locked,
  donation_update,
} from "$/pg/queries/donation";
import type { Route } from "./+types/api.chariot-webhook";

/** `t=<iso-8601>,v1=<hex>[,v1=<hex>…]` — collects every `v1`, any of which may match; other schemes are ignored so a weaker one can't stand in for `v1` */
function parse_signature(header: string): { t: string; v1: string[] } | null {
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;
    if (key === "t") t = value;
    else if (key === "v1") v1.push(value);
  }
  return t && v1.length ? { t, v1 } : null;
}

const on_grant_canceled: Record<TStatus, "cancel" | "keep" | "alert"> = {
  created: "cancel",
  intent: "cancel",
  confirmed: "cancel",
  // final with no money moved: nothing to cancel or reverse
  cancelled: "keep",
  expired: "keep",
  failed: "keep",
  // money already moved: a settled row needs reversing by hand; a refunded one
  // was already reversed, so what is left is a platform loss to record
  settled: "alert",
  refunded: "alert",
  refunded_loss: "alert",
};

const refunded_todo =
  "the donor was already refunded for a grant that will never pay; record the refund as a platform loss";
const on_canceled_todo: Partial<Record<TStatus, string>> = {
  settled: "reverse the donation with the refund tooling",
  refunded: refunded_todo,
  refunded_loss: refunded_todo,
};

// a completed grant is the fund's payout, so it settles any row not already
// final; completing a cancelled row means chariot reversed its own cancel,
// which a person confirms before it settles
const on_grant_completed: Record<TStatus, "settle" | "duplicate" | "alert"> = {
  created: "settle",
  intent: "settle",
  confirmed: "settle",
  expired: "settle",
  failed: "settle",
  cancelled: "alert",
  settled: "duplicate",
  refunded: "duplicate",
  refunded_loss: "duplicate",
};

/** what an operator needs to act on: the money and whose it is, never the donor */
const grant_facts = (
  grant: { id: string; amount: number },
  don: IDonation,
  sttl_id?: string
) =>
  [
    `amount ${(grant.amount / 100).toFixed(2)} USD`,
    `recipient ${don.to_name} (${don.to_id})`,
    `grant ${grant.id}`,
    sttl_id && `settlement ${sttl_id}`,
  ]
    .filter(Boolean)
    .join(", ");

/**
 * the enqueue follows the settle's commit, so a delivery can leave a settled
 * row whose messages never went out, or only some; its redelivery is what
 * re-sends them. receipt and match absorb a repeat downstream (send claim,
 * unique donation_id); the dist goes only while none exists, since a fund's
 * split is recomputed per run and a newly active member would get a share.
 */
async function requeue(row: IDonationSettled) {
  const distributed = await donation_has_dists(row.id);
  const msgs = settle_msgs(row, { match: true }).filter(
    (m) => !(distributed && m.id === "don-sttl-dist")
  );
  await enqueue(...msgs);
}

interface IOpsAlert {
  /** sentry error message */
  message: string;
  title: string;
  /** safe to log: ids and statuses only */
  detail: string;
  facts: string;
  todo: string;
  ctx: Record<string, unknown>;
}

async function alert_ops({
  message,
  title,
  detail,
  facts,
  todo,
  ctx,
}: IOpsAlert) {
  report_error(new Error(message), ctx);
  // the report above already holds the event; a discord outage must not
  // 500 the ack into redeliveries that re-report it
  await aws_monitor
    .send_alert({
      type: "ERROR",
      from: `chariot-webhook:${stage}`,
      title,
      body: `${detail}. ${facts}. ${todo}.`,
    })
    .catch((err) => report_error(err, ctx));
  console.warn(`[chariot webhook] ${detail}: left unchanged, alerted`);
}

function safe_equals(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  // timingSafeEqual throws on unequal lengths
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const sig = request.headers.get("chariot-webhook-signature");
    const body = await request.text();

    const parsed = parse_signature(sig ?? "");
    if (!parsed)
      return new Response("malformed signature header", { status: 400 });

    const signed = `${parsed.t}.${body}`;
    const hash = crypto
      .createHmac("sha256", chariot_env.signing_key)
      .update(signed)
      .digest("hex");

    // 4xx, not 2xx: chariot reads 2xx as delivered, so a signing-key mismatch
    // would drop every grant silently; a 4xx is redelivered in production and,
    // after 5 days of failures, flags the subscription `requires_attention`.
    // warn, not report_error: anyone can send a forgery, so each one would
    // raise a report.
    if (!parsed.v1.some((v) => safe_equals(hash, v))) {
      console.warn(
        `[chariot webhook] signature mismatch: t=${parsed.t}, ${parsed.v1.length} v1`
      );
      return new Response("signature mismatch", { status: 401 });
    }

    const payload = JSON.parse(body);
    // https://docs.givechariot.com/api/webhooks
    const category = payload.category ?? "unknown";
    if (payload.associated_object_type !== "grant") {
      console.info(
        `[chariot webhook] ignored: event ${payload.id} ${category} ${payload.associated_object_type}`
      );
      return new Response("", { status: 200 });
    }
    console.info(`[chariot webhook] received: event ${payload.id} ${category}`);
    const grant = await chariot.get_grant(payload.associated_object_id);
    // grant carries donor name, email, phone, address — log ids/status only
    console.info(`[chariot webhook] grant ${grant.id} status ${grant.status}`);
    const { don_id } = (grant.metadata ?? {}) as Partial<ChariotMetadata>;
    // not from our checkout (another connect instance, a dashboard grant):
    // no row can ever match, so a 5xx would only buy ten redeliveries
    if (typeof don_id !== "string" || !don_id) {
      report_error(new Error("chariot grant without a donation id"), {
        grant_id: grant.id,
        status: grant.status,
      });
      return new Response("", { status: 200 });
    }

    if (grant.status === "Canceled") {
      // unlocked read first: the locked one matches `id` only, grant metadata
      // can carry a legacy `id_v1`, and the alert needs the recipient
      const prior = await donation_get(don_id);
      if (!prior) throw new Error(`donation not found: ${don_id}`);
      const { op, state } = await db.transaction(async (tx) => {
        const state = await donation_settle_state_locked(tx, prior.id);
        if (!state) throw new Error(`donation not found: ${prior.id}`);
        const op = on_grant_canceled[state.status];
        if (op === "cancel")
          await donation_update(tx, prior.id, { status: "cancelled" });
        return { op, state };
      });
      if (op === "alert") {
        await alert_ops({
          message: "chariot grant canceled after settlement",
          title: "Chariot Grant Canceled After Settlement",
          detail: `donation ${prior.id} is ${state.status} but chariot grant ${grant.id} was canceled`,
          facts: grant_facts(grant, prior, state.sttl_id),
          todo: `nothing was changed automatically; ${on_canceled_todo[state.status]}`,
          ctx: { don_id: prior.id, grant_id: grant.id, status: state.status },
        });
        return new Response("", { status: 200 });
      }
      if (op === "keep") {
        console.info(
          `[chariot webhook] donation ${prior.id} is ${state.status}: left unchanged`
        );
        return new Response("", { status: 200 });
      }
      console.info(`[chariot webhook] donation ${prior.id} cancelled`);
      return new Response("", { status: 202 });
    }

    if (grant.status !== "Completed") {
      console.info(`${don_id} status:${grant.status}`);
      // avoid retry
      return new Response("", { status: 203 });
    }

    const gross = grant.amount / 100;
    const fee = (grant.feeDetail?.total ?? 0) / 100;

    const completed_at =
      grant.statuses?.filter((x) => x.status === "Completed").at(-1)
        ?.createdAt ?? grant.updatedAt;

    const settlement: ISettlement = {
      date: new Date(completed_at ?? Date.now()).toISOString(),
      net: gross - fee,
      fee,
      id: grant.id,
      currency: "USD",
    };

    const prior = await donation_get(don_id);
    if (!prior) throw new Error(`donation not found: ${don_id}`);
    const locked = await db.transaction(async (tx) => {
      const state = await donation_settle_state_locked(tx, prior.id);
      if (!state) throw new Error(`donation not found: ${prior.id}`);
      const op = on_grant_completed[state.status];
      if (op !== "settle") return { op, state };
      const result = calc_donation_settle({
        kind: "one-time",
        order_id: prior.id,
        prior: { ...prior, status: state.status },
        settlement,
      });
      if (result.op !== "update")
        throw new Error(`unexpected ${result.op} for chariot one-time`);
      await donation_update(tx, result.order_id, result.patch);
      return { op, state, msgs: result.msgs };
    });

    if (locked.op === "settle") {
      await enqueue(...locked.msgs);
      return Response.json({ id: prior.id });
    }

    if (locked.op === "alert") {
      await alert_ops({
        message: "chariot grant completed after cancel",
        title: "Chariot Grant Completed After Cancel",
        detail: `donation ${prior.id} is cancelled but chariot grant ${grant.id} completed`,
        facts: `${grant_facts(grant, prior)}, net ${settlement.net.toFixed(2)} USD, fee ${settlement.fee.toFixed(2)} USD`,
        todo: "nothing was settled automatically; confirm the payout in chariot's dashboard before settling it by hand",
        ctx: {
          don_id: prior.id,
          grant_id: grant.id,
          status: locked.state.status,
        },
      });
      return new Response("", { status: 200 });
    }
    const { sttl_id } = locked.state;
    if (locked.state.status === "settled" && !sttl_id)
      throw new Error(`donation ${prior.id} is settled without a settlement`);
    if (sttl_id && sttl_id !== grant.id) {
      await alert_ops({
        message: "chariot grant completed on a donation another grant settled",
        title: "Chariot Grant Completed On A Settled Donation",
        detail: `donation ${prior.id} is ${locked.state.status} by settlement ${sttl_id} but chariot grant ${grant.id} also completed`,
        facts: grant_facts(grant, prior, sttl_id),
        todo: "nothing was settled or re-sent automatically; this grant's payout is not recorded against any donation",
        ctx: {
          don_id: prior.id,
          grant_id: grant.id,
          sttl_id,
          status: locked.state.status,
        },
      });
      return new Response("", { status: 200 });
    }
    // duplicate, acked 2xx so chariot stops redelivering: a reversed row gets
    // nothing re-sent; a row read unsettled and settled under the lock is the
    // concurrent delivery's to enqueue
    if (locked.state.status === "settled" && prior.settlement)
      await requeue({ ...prior, settlement: prior.settlement });
    console.info(
      `[chariot webhook] donation ${prior.id} is ${locked.state.status}: left unchanged`
    );
    return new Response("", { status: 200 });
  } catch (err) {
    return report_resp(err, "something went wrong");
  }
}
