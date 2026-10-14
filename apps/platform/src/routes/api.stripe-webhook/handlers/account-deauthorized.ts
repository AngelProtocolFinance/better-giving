import type Stripe from "stripe";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_stripe_deauthorize } from "$/pg/queries/npo";
import { reg_stripe_deauthorize } from "$/pg/queries/registration";

/** what a disconnect did. `stale`: the npo connected the account again after
 * the event, so it is a redelivery of an earlier disconnect and changes
 * nothing. `reg_cleared`: an applicant's registration no longer holds it */
export type TDeauthorized =
  | { status: "marked"; npo_id: number }
  | { status: "stale"; npo_id: number }
  | { status: "reg_cleared"; reg_id: string }
  | { status: "unknown" };

/** `ev.account` disconnected us from its stripe dashboard. an npo holding it
 * is stamped, so its later settlements fall back to pooled; a registration
 * holding it drops it, so the applicant can connect again */
export async function handle_account_deauthorized(
  ev: Stripe.AccountApplicationDeauthorizedEvent
): Promise<TDeauthorized> {
  if (!ev.account) return { status: "unknown" };
  const at = new Date(ev.created * 1000).toISOString();
  const npo = await npo_stripe_deauthorize(ev.account, at);
  if (npo.status === "stale") return npo;
  if (npo.status === "unknown") {
    const reg_id = await reg_stripe_deauthorize(ev.account);
    return reg_id ? { status: "reg_cleared", reg_id } : npo;
  }

  // pooled pays out over wise to the default bank details, the grants run's
  // recipient: without them the npo's share waits in its balance
  if (!(await npo_default_bapp(npo.npo_id))) {
    // awaited: a lost notice fails the delivery, and the redelivery re-stamps
    // as a no-op. keyed on the event, so it collapses into one notice
    await enqueue(
      msg("fiat-notice", {
        id: ev.id,
        alert: {
          type: "NOTICE",
          from: `stripe-connect-${stage}`,
          title: "Disconnected Nonprofit Has No Bank Details",
          body: [
            `npo ${npo.npo_id} disconnected stripe account ${ev.account} (event ${ev.id}).`,
            "its card donations now settle pooled, but it has no default bank details: payouts wait until it adds some.",
          ].join("\n"),
        },
      })
    );
  }
  return npo;
}
