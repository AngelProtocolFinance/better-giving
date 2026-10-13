import { rail_of } from "@/donations/rail";
import { is_routable, routing_npo } from "@/stripe-connect/eligibility";
import { stripe as stripe_env } from "../env";
import type { INpo } from "../pg/queries/npo";

/**
 * the connected account a gift paid through `via` to `npo` settles to, or null
 * to settle it pooled: money stripe took, for an npo that can receive it now
 */
export const routed_account = (npo: INpo, via: string): string | null =>
  // every other rail settles money that never touched our stripe balance
  rail_of(via) === "stripe" &&
  is_routable(routing_npo(npo), stripe_env.connect_routing)
    ? npo.stripe_account_id
    : null;
