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
  | "ready";

export const account_mirror = (acct: Stripe.Account): IAccountMirror => ({
  charges_enabled: acct.charges_enabled,
  payouts_enabled: acct.payouts_enabled,
  details_submitted: acct.details_submitted,
  requirements_due: acct.requirements?.currently_due ?? [],
});

/** incomplete is the nonprofit's move (finish on stripe); pending is stripe's */
export const connect_status = (m: IAccountMirror | null): TConnectStatus => {
  if (!m) return "not_connected";
  if (m.charges_enabled && m.payouts_enabled && m.details_submitted) {
    return "ready";
  }
  if (!m.details_submitted || m.requirements_due.length > 0) {
    return "incomplete";
  }
  return "pending";
};
