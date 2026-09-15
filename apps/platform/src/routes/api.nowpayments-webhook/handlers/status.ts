import { is_reversed, type TStatus } from "@/donations";
import type { NP } from "@/nowpayments/types";
import type { SettleState } from "$/pg/queries/donation";

export type Action =
  /** nothing to write; `alert` when ops should still hear of it */
  | { op: "ignore"; why: string; alert?: true }
  /** remember the payment id on the order */
  | { op: "record" }
  | { op: "confirm" }
  | { op: "expire" }
  | { op: "fail" }
  | { op: "refund"; was_settled: boolean }
  /** `late`: over a `failed` or `expired` row — the funds did arrive */
  | { op: "settle"; late: boolean }
  /** this payment already settled the row */
  | { op: "duplicate" }
  /** funds arrived for a row closed under another outcome */
  | { op: "refuse" };

/**
 * statuses no `waiting`, `confirming`, `expired` or `failed` ipn moves a row
 * off. nowpayments sends one ipn per step, redelivers on error and lets the
 * dashboard resend any of them, in no documented order.
 */
const terminal = new Set<TStatus>([
  "settled",
  "failed",
  "expired",
  "refunded",
  "refunded_loss",
  "cancelled",
]);

const ignore = (why: string): Action => ({ op: "ignore", why });

/**
 * what an ipn does to the row it lands on — the order row, or for a repeated
 * deposit (`repeat`) the clone that settled it, `null` before one exists.
 *
 * pure, so a handler that read `prior` early and one re-reading it under the
 * row lock reach the same decision from the same state.
 */
export function transition(
  prior: SettleState | null,
  ipn: Pick<NP.PaymentPayload, "payment_status" | "payment_id">,
  flags: { repeat: boolean }
): Action {
  const status = ipn.payment_status;
  switch (status) {
    // `sending` reads as still pending; `confirmed` follows the `confirming`
    // that already wrote the row's `confirmed`
    case "confirmed":
    case "sending":
      return ignore("unhandled");

    case "waiting":
    case "confirming":
    case "expired":
    case "failed": {
      // a repeated deposit's order row belongs to the parent payment
      if (flags.repeat) {
        return status === "failed" || status === "expired"
          ? { op: "ignore", why: `repeated deposit ${status}`, alert: true }
          : ignore("repeated deposit unhandled");
      }
      if (!prior) return ignore("donation not found");
      if (terminal.has(prior.status)) {
        return ignore(`terminal prior:${prior.status}`);
      }
      const op = (
        {
          waiting: "record",
          confirming: "confirm",
          expired: "expire",
          failed: "fail",
        } as const
      )[status];
      return { op };
    }

    case "refunded":
      if (!prior) return ignore("refund, none settled");
      if (is_reversed(prior.status) || prior.status === "cancelled") {
        return ignore(`refund on closed prior:${prior.status}`);
      }
      return { op: "refund", was_settled: prior.status === "settled" };

    case "finished":
    case "partially_paid": {
      if (!prior) {
        return flags.repeat
          ? { op: "settle", late: false }
          : ignore("donation not found");
      }
      const by_this = prior.sttl_id === ipn.payment_id.toString();
      if (prior.status === "settled") {
        return by_this ? { op: "duplicate" } : { op: "refuse" };
      }
      // the refund already reversed this donation; nothing to write, and no throw
      // — nowpayments reads a 5xx as an endpoint to keep retrying.
      if (is_reversed(prior.status) && by_this) {
        return ignore(`settled before refund, prior:${prior.status}`);
      }
      if (prior.status === "failed" || prior.status === "expired") {
        return { op: "settle", late: true };
      }
      if (terminal.has(prior.status)) return { op: "refuse" };
      return { op: "settle", late: false };
    }

    default:
      // a status nowpayments added after these types were written
      status satisfies never;
      return ignore("unhandled");
  }
}
