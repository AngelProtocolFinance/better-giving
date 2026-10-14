import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import Stripe from "stripe";
import { report_error } from "#/errors/report";
import {
  account_mirror,
  connect_status,
  type IAccountMirror,
  mirror_of,
  type TConnectStatus,
} from "@/stripe-connect/readiness";
import { stripe } from "../kit/stripe";
import { db } from "../pg/db";
import { npos } from "../pg/schema/npo";

/** the mirror as `npos` stores it; `mirror_of` reads it back */
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

/** the stamp guard every mirror write shares: an older reading never lands on
 * a newer one. `strict` makes a same-stamp tie go to the row already written */
export const not_newer_than = (at: string, strict = false) =>
  or(
    isNull(npos.stripe_synced_at),
    strict ? lt(npos.stripe_synced_at, at) : lte(npos.stripe_synced_at, at)
  );

/** a read stripe refuses: the account revoked our access, or never granted it */
const is_disconnected = (err: unknown) =>
  err instanceof Stripe.errors.StripePermissionError;

/** refreshes the npo's readiness mirror from stripe; null when it has no
 * account, "disconnected" when it disconnected us or stripe refuses the read —
 * either way the mirror is left as it stands */
export async function sync_npo_account(
  npo_id: number
): Promise<IAccountMirror | "disconnected" | null> {
  const [npo] = await db
    .select({
      acct: npos.stripe_account_id,
      deauthorized_at: npos.stripe_deauthorized_at,
    })
    .from(npos)
    .where(eq(npos.id, npo_id));
  if (!npo?.acct) return null;
  if (npo.deauthorized_at !== null) return "disconnected";

  // taken before the read, and in whole seconds like stripe's event stamps: an
  // event from the same second may describe a newer state, so the tie is its
  const at = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  let acct: Stripe.Account;
  try {
    acct = await stripe.accounts.retrieve(npo.acct);
  } catch (err) {
    if (is_disconnected(err)) return "disconnected";
    throw err;
  }
  const m = account_mirror(acct);
  const written = await db
    .update(npos)
    .set({ ...mirror_columns(m), stripe_synced_at: at })
    .where(
      and(
        eq(npos.id, npo_id),
        eq(npos.stripe_account_id, npo.acct),
        not_newer_than(at, true)
      )
    )
    .returning({ id: npos.id });
  if (written.length) return m;

  const [now] = await db.select().from(npos).where(eq(npos.id, npo_id));
  // replaced while stripe was answering: these flags are the old account's
  if (now?.stripe_account_id !== npo.acct) return sync_npo_account(npo_id);
  // an account.updated landed meanwhile and is newer than this read
  return mirror_of(now);
}

/** whether stripe still lets us read `acct`. a permission error is the
 * disconnect. anything else throws: a connect and a disconnect in the same
 * second are told apart by this, and a guess would either drop a live
 * connection or keep routing to one that is gone */
export async function account_access_live(acct_id: string): Promise<boolean> {
  try {
    await stripe.accounts.retrieve(acct_id);
    return true;
  } catch (err) {
    if (is_disconnected(err)) return false;
    throw err;
  }
}

/** a registration's status, read from stripe each time: registrations keep no mirror */
export async function account_status_live(
  acct_id: string
): Promise<TConnectStatus> {
  try {
    const acct = await stripe.accounts.retrieve(acct_id);
    // a registration keeps no disconnect stamp: a read that lands is connected
    return connect_status(account_mirror(acct), null);
  } catch (err) {
    if (is_disconnected(err)) return "disconnected";
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    report_error(err);
    // connected but unreadable: never "ready", and not the nonprofit's move
    return "pending";
  }
}
