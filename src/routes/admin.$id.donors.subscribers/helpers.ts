import * as v from "valibot";
import { $int_gte1 } from "@/schemas";

export const subs_search = v.object({
  limit: v.optional($int_gte1),
  next: v.optional(v.string()),
});

export interface ISubsSearch extends v.InferOutput<typeof subs_search> {}
