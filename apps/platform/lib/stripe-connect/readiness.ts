import type Stripe from "stripe";

/** what `npos` keeps of a connected account: stripe's readiness, as last reported */
export interface IAccountMirror {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  /** `requirements.currently_due` */
  requirements_due: string[];
}

export type TConnectStatus =
  | "not_connected"
  | "incomplete"
  | "pending"
  | "ready"
  | "disconnected";

export const account_mirror = (acct: Stripe.Account): IAccountMirror => ({
  charges_enabled: acct.charges_enabled,
  payouts_enabled: acct.payouts_enabled,
  details_submitted: acct.details_submitted,
  requirements_due: acct.requirements?.currently_due ?? [],
});

/** incomplete is the nonprofit's move (finish on stripe); pending is stripe's.
 * `deauthorized_at`: when the nonprofit disconnected us, null while connected */
export const connect_status = (
  m: IAccountMirror | null,
  deauthorized_at: string | null
): TConnectStatus => {
  if (!m) return "not_connected";
  // the mirror can predate the disconnect, so it never vouches past one
  if (deauthorized_at !== null) return "disconnected";
  if (m.charges_enabled && m.payouts_enabled && m.details_submitted) {
    return "ready";
  }
  if (!m.details_submitted || m.requirements_due.length > 0) {
    return "incomplete";
  }
  return "pending";
};
