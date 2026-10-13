import { country_code } from "#/constants/countries";
import type { ITo } from "@/donations";
import { descriptor_suffix } from "@/stripe-connect/descriptor";
import { is_routable } from "@/stripe-connect/eligibility";
import { stripe as stripe_env } from "$/env";
import { npo_get } from "$/pg/queries/npo";

/**
 * the account's shortened descriptor — must match dashboard → settings →
 * business details. 10 chars, stripe's maximum for a prefix, so a shorter one
 * there only leaves the suffix shorter than it could be, never over 22
 */
export const STATEMENT_DESCRIPTOR_PREFIX = "BETTER GIV";

/** the card-statement suffix naming a routed npo; undefined for a fund or
 * an npo that settles pooled */
export async function npo_descriptor_suffix(
  to: ITo
): Promise<string | undefined> {
  // the switch first: while it is off, no donation pays for the npo read
  if (to.to_type !== "npo" || !stripe_env.connect_routing) return undefined;
  const npo = await npo_get(+to.to_id);
  if (!npo) return undefined;
  const routable = is_routable(
    { ...npo, hq_country_code: country_code(npo.hq_country) },
    stripe_env.connect_routing
  );
  return routable
    ? descriptor_suffix(npo.name, STATEMENT_DESCRIPTOR_PREFIX)
    : undefined;
}
