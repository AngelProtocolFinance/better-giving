import * as v from "valibot";
import { update_org_fv } from "@/reg/schema";

/** hq country is collected on the first screen and never re-asked, but it
 * stays on the wire schema (`update_org`) so an older client's payload is
 * still accepted. */
export const schema = v.omit(update_org_fv, ["o_hq_country"]);

export interface FV extends v.InferOutput<typeof schema> {}
