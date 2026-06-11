import type { InferOutput } from "valibot";
import type { update_org_fv } from "@/reg/schema";

export { update_org_fv as schema } from "@/reg/schema";

export interface FV extends InferOutput<typeof update_org_fv> {}
