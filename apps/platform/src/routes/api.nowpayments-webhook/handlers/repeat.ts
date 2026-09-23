import {
  calc_donation_settle,
  type IDonation,
  is_reversed,
  settle_msgs,
} from "@/donations";
import type { NP } from "@/nowpayments/types";
import { nowpayments } from "$/env";
import { np } from "$/kit/nowpayments";
import { enqueue } from "$/kit/queue";
import {
  donation_by_sttl_id,
  donation_put_once,
  settle_state_of,
} from "$/pg/queries/donation";
import { alert, alert_all } from "./alert";
import { paid_amount, ref_of, to_settlement } from "./payment";
import { settle_rates } from "./rates";
import { handle_refund } from "./refund";
import { transition } from "./status";

const REPEAT = { repeat: true };

/**
 * a payment carrying `parent_payment_id` is another deposit to the order's
 * address, sent with the parent's `order_id`. it never writes the order row —
 * that row is the parent payment's — and settles as a donation of its own,
 * cloned from the order and keyed by its own payment id.
 */
export async function handle_repeat(
  payment: NP.PaymentPayload,
  order: IDonation
): Promise<void> {
  const ref = ref_of(payment);
  const log = (msg: string) =>
    console.info(`nowpayments-webhook: repeated deposit ${msg} ${ref}`);
  const sttl_id = payment.payment_id.toString();

  // a clone's enqueue sits after its commit, so a delivery can leave some or
  // all of its messages unsent; a redelivery re-sends them all. the dist is
  // absorbed per destination by unique(donation_id, to_id) — a fund's split is
  // recomputed on each run, so a member activated in between gets a share the
  // first run didn't count — the receipt by its send claim.
  // a clone re-read after a lost put never passed `transition`, so it can be
  // one a refund reversed — re-sending would dist and receipt refunded money
  const requeue = async (own: IDonation | undefined) => {
    if (!own?.settlement) throw new Error(`clone ${sttl_id} not found`);
    if (is_reversed(own.status)) return log(`reversed prior:${own.status}`);
    await enqueue(
      ...settle_msgs({ ...own, settlement: own.settlement }, { match: false })
    );
    log("already settled");
  };

  const own = await donation_by_sttl_id(sttl_id);
  const action = transition(own ? settle_state_of(own) : null, payment, REPEAT);

  switch (action.op) {
    case "ignore":
      log(action.why);
      if (action.alert) {
        await alert({
          title: `Repeated deposit ${payment.payment_status}`,
          body: ref,
        });
      }
      return;

    case "duplicate":
      return requeue(own);

    case "refuse":
      log(`settle refused prior:${own?.status}`);
      await alert({
        title: "Repeated deposit settled on a closed donation",
        type: "ERROR",
        body: `${ref} donation:${own?.id}`,
      });
      return;

    case "refund": {
      if (!own) throw new Error(`clone ${sttl_id} not found`);
      const now = await handle_refund(own, payment, REPEAT);
      if (now.op !== "refund")
        return log(`refund lost the row lock: ${now.op}`);
      if (now.was_settled) {
        await alert({
          title: "Settled repeated deposit refunded",
          body: `${ref} donation:${own.id}`,
        });
      }
      return;
    }

    case "settle": {
      const rates = await settle_rates(payment);
      const { usdpu } = await np.estimate(payment.pay_currency);
      const sttl = to_settlement(payment, rates, new Date().toISOString());
      await alert_all(sttl.warnings);

      const result = calc_donation_settle({
        kind: "redeposit",
        order_id: order.id,
        prior: {
          ...order,
          amount: paid_amount(payment, order, nowpayments.is_sandbox),
          upusd: 1 / usdpu,
          via_extra: sttl_id,
        },
        settlement: sttl.value,
        new_id: crypto.randomUUID(),
      });
      if (result.op !== "put") {
        throw new Error(`unexpected ${result.op} for nowpayments redeposit`);
      }

      // null: a concurrent delivery cloned it first
      const row = await donation_put_once(result.row);
      if (!row) return requeue(await donation_by_sttl_id(sttl_id));

      await enqueue(...result.msgs);
      await alert({
        title: "Repeated deposit settled",
        body: `${ref} donation:${row.id}`,
        fields: [
          {
            name: "outcome",
            value: `${payment.outcome_amount} ${payment.outcome_currency.toUpperCase()}`,
          },
        ],
      });
      return;
    }

    case "record":
    case "confirm":
    case "expire":
    case "fail":
      throw new Error(`unexpected ${action.op} for a repeated deposit`);

    default:
      action satisfies never;
  }
}
