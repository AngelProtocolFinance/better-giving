import type Stripe from "stripe";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_stripe_deauthorize } from "$/pg/queries/npo";

/** the npo holding `ev.account` disconnected us from its stripe dashboard:
 * stamped, so its later settlements fall back to pooled. false when no npo
 * holds the account (a registration's, or one since replaced) */
export async function handle_account_deauthorized(
  ev: Stripe.AccountApplicationDeauthorizedEvent
): Promise<boolean> {
  if (!ev.account) return false;
  const at = new Date(ev.created * 1000).toISOString();
  const npo_id = await npo_stripe_deauthorize(ev.account, at);
  if (npo_id === null) return false;

  // pooled pays out over wise to the default bank details, the grants run's
  // recipient: without them the npo's share waits in its balance
  if (!(await npo_default_bapp(npo_id))) {
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
            `npo ${npo_id} disconnected stripe account ${ev.account} (event ${ev.id}).`,
            "its card donations now settle pooled, but it has no default bank details: payouts wait until it adds some.",
          ].join("\n"),
        },
      })
    );
  }
  return true;
}
