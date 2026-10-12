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
import { npo_stripe_get } from "$/pg/queries/npo";
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
  const s = await npo_stripe_get(npo_id);
  if (!s?.acct) return "not_connected";
  if (s.synced_at) return connect_status(s.mirror);
  try {
    return connect_status(await sync_npo_account(npo_id));
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    report_degraded(err);
    // linked but unread: never "ready", and not the nonprofit's move
    return "pending";
  }
}
