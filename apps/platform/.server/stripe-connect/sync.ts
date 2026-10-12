import { and, eq, isNull, lte, or } from "drizzle-orm";
import Stripe from "stripe";
import { report_error } from "#/errors/report";
import {
  account_mirror,
  connect_status,
  type IAccountMirror,
  type TConnectStatus,
} from "@/stripe-connect/readiness";
import { stripe } from "../kit/stripe";
import { db } from "../pg/db";
import { npos } from "../pg/schema/npo";

export const mirror_columns = (m: IAccountMirror) => ({
  stripe_charges_enabled: m.charges_enabled,
  stripe_payouts_enabled: m.payouts_enabled,
  stripe_details_submitted: m.details_submitted,
  stripe_requirements_due: m.requirements_due,
});

/** what an npo's mirror reads before stripe has said anything about its account */
export const mirror_unset = {
  ...mirror_columns({
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements_due: [],
  }),
  stripe_synced_at: null,
};

/** the stamp guard every mirror write shares: an older reading never lands on a newer one */
export const not_newer_than = (at: string) =>
  or(isNull(npos.stripe_synced_at), lte(npos.stripe_synced_at, at));

/** refreshes the npo's readiness mirror from stripe; null when it has no account */
export async function sync_npo_account(
  npo_id: number
): Promise<IAccountMirror | null> {
  const [npo] = await db
    .select({ acct: npos.stripe_account_id })
    .from(npos)
    .where(eq(npos.id, npo_id));
  if (!npo?.acct) return null;

  // taken before the read: an event stamped after it describes a newer state
  const at = new Date().toISOString();
  const m = account_mirror(await stripe.accounts.retrieve(npo.acct));
  const written = await db
    .update(npos)
    .set({ ...mirror_columns(m), stripe_synced_at: at })
    .where(
      and(
        eq(npos.id, npo_id),
        eq(npos.stripe_account_id, npo.acct),
        not_newer_than(at)
      )
    )
    .returning({ id: npos.id });
  if (written.length) return m;

  const [now] = await db.select().from(npos).where(eq(npos.id, npo_id));
  // replaced while stripe was answering: these flags are the old account's
  if (now?.stripe_account_id !== npo.acct) return sync_npo_account(npo_id);
  // an account.updated landed meanwhile and is newer than this read
  return {
    charges_enabled: now.stripe_charges_enabled,
    payouts_enabled: now.stripe_payouts_enabled,
    details_submitted: now.stripe_details_submitted,
    requirements_due: now.stripe_requirements_due,
  };
}

/** a registration's status, read from stripe each time: registrations keep no mirror */
export async function account_status_live(
  acct_id: string
): Promise<TConnectStatus> {
  try {
    const acct = await stripe.accounts.retrieve(acct_id);
    return connect_status(account_mirror(acct));
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    report_error(err);
    // connected but unreadable: never "ready", and not the nonprofit's move
    return "pending";
  }
}
