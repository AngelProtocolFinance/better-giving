import { EMAILS } from "@better-giving/brand";
import type { IAllocation } from "../donations/schema";
import type { IIncrement } from "../schemas";

export const MIN_DONATION_USD = 2;

export const default_allocation: IAllocation = {
  liq: 0,
  cash: 100,
  lock: 0,
};

export const PROCESSING_RATES = {
  chariot: 0.029,
  stripe: 0.022,
  /** $cents */
  stripe_flat: 0.3,
  stripe_bank: 0.008,
  /** $usd */
  stripe_bank_cap: 5,
  paypal: 0.0199,
  paypal_flat: 0.49,
  crypto: 0.01,
};

export const DONATION_INCREMENTS: IIncrement[] = [
  { value: "40", label: "" },
  { value: "100", label: "" },
  { value: "200", label: "" },
  { value: "400", label: "" },
];

export const logo_url = (path: string, custom = false) =>
  custom ? path : `https://nowpayments.io${path}`;

// the personal inboxes are routing detail and stay here; `hi` is the brand's
// contact point, so it comes from `@better-giving/brand` and can't drift from the
// sender line on outgoing mail.
export const emails = {
  tim: "tim@better.giving",
  jms: "justin@better.giving",
  chauncey: "chauncey@better.giving",
  hi: EMAILS.hi,
};

export const GENERIC_ERROR_MESSAGE = `An unexpected error occurred and has been reported. Please get in touch with ${emails.hi} if the problem persists.`;
