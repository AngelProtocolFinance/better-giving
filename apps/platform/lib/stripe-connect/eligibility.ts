import { connect_status } from "./readiness";

/**
 * hq countries a US platform can transfer to a full-agreement connected account
 * in, as ISO 3166-1 alpha-2: US, CA, GB, CH and the EEA, less IS (stripe opens
 * icelandic accounts on the recipient agreement only). read 2026-10-13 off
 * docs.stripe.com/connect/account-capabilities.md#cross-border-transfers ("a
 * transfer across unsupported borders returns an error") and
 * docs.stripe.com/payouts.md (the per-country recipient-only flags). from the
 * api, `GET /v1/country_specs/US` → `supported_transfer_countries` — but that
 * list also holds every recipient-agreement destination, so it is a superset
 * of this one and never a drop-in.
 */
export const TRANSFER_COUNTRIES: ReadonlySet<string> = new Set([
  "US",
  "CA",
  "GB",
  "CH",
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "LI",
  "NO",
]);

/** the `npos` columns routing decides on */
export interface IRoutingNpo {
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  stripe_requirements_due: string[];
  fiscal_sponsored: boolean;
  /** ISO 3166-1 alpha-2 of `npos.hq_country`, which stores the name;
   * undefined when the name maps to no code */
  hq_country_code: string | undefined;
  /** set once the npo disconnected us from its stripe dashboard */
  stripe_deauthorized_at: string | null;
}

const is_ready = (npo: IRoutingNpo) =>
  npo.stripe_account_id !== null &&
  // the readiness mirror can predate the disconnect, so it never vouches past one
  npo.stripe_deauthorized_at === null &&
  connect_status({
    charges_enabled: npo.stripe_charges_enabled,
    payouts_enabled: npo.stripe_payouts_enabled,
    details_submitted: npo.stripe_details_submitted,
    requirements_due: npo.stripe_requirements_due,
  }) === "ready";

const in_transfer_set = (code: string | undefined) =>
  !!code && TRANSFER_COUNTRIES.has(code.toUpperCase());

/** whether a card donation to `npo` routes to its connected account
 * @param routing_on - the `STRIPE_CONNECT_ROUTING` switch */
export const is_routable = (npo: IRoutingNpo, routing_on: boolean) =>
  routing_on &&
  !npo.fiscal_sponsored &&
  is_ready(npo) &&
  in_transfer_set(npo.hq_country_code);
