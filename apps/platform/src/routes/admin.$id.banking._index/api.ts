import Stripe from "stripe";
import { admin_ctx } from "#/.server/auth";
import { report_degraded } from "#/errors/report";
import type { IBapp } from "@/banking";
import {
  connect_notice,
  connect_start_href,
  type IConnectCardData,
} from "@/stripe-connect/card-data";
import {
  connect_status,
  type TConnectStatus,
} from "@/stripe-connect/readiness";
import { npo_bapps } from "$/pg/queries/banking";
import { npo_get } from "$/pg/queries/npo";
import { sync_npo_account } from "$/stripe-connect/sync";
import type { Route } from "./+types/route";

export interface LoaderData {
  methods: IBapp[];
  stripe: IConnectCardData;
}

export const loader = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);

  const [page, status] = await Promise.all([npo_bapps(id), stripe_status(id)]);
  const stripe: IConnectCardData = {
    status,
    start_href: connect_start_href({ kind: "npo", npo_id: id }),
    notice: connect_notice(new URL(x.request.url)),
  };
  return { methods: page.items, stripe } satisfies LoaderData;
};

async function stripe_status(npo_id: number): Promise<TConnectStatus> {
  const npo = await npo_get(npo_id);
  if (!npo?.stripe_account_id) return "not_connected";
  const deauthorized_at = npo.stripe_deauthorized_at;
  if (npo.stripe_synced_at || deauthorized_at) {
    const mirror = {
      charges_enabled: npo.stripe_charges_enabled,
      payouts_enabled: npo.stripe_payouts_enabled,
      details_submitted: npo.stripe_details_submitted,
      requirements_due: npo.stripe_requirements_due,
    };
    return connect_status(mirror, deauthorized_at);
  }
  try {
    const m = await sync_npo_account(npo_id);
    return m === "disconnected" ? m : connect_status(m, null);
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    report_degraded(err);
    // linked but unread: never "ready", and not the nonprofit's move
    return "pending";
  }
}
