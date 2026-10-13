import type { ITo } from "@/donations";
import { descriptor_suffix } from "@/stripe-connect/descriptor";
import { stripe as stripe_env } from "$/env";
import { npo_get } from "$/pg/queries/npo";
import { routed_account } from "$/stripe-connect/routing";

/**
 * stripe's maximum for the account's shortened descriptor (dashboard →
 * settings → business details), budgeted whatever it says there: a shorter one
 * leaves the suffix shorter than it could be, never the whole over 22
 */
const PREFIX_MAX_LEN = 10;

/** the card-statement suffix naming a routed npo; undefined for a fund or
 * an npo that settles pooled */
export async function npo_descriptor_suffix(
  to: ITo
): Promise<string | undefined> {
  // the switch first: while it is off, no donation pays for the npo read
  if (to.to_type !== "npo" || !stripe_env.connect_routing) return undefined;
  const npo = await npo_get(+to.to_id);
  if (!npo) return undefined;
  // a suffix shows on card charges only
  return routed_account(npo, "stripe:card")
    ? descriptor_suffix(npo.name, PREFIX_MAX_LEN)
    : undefined;
}
