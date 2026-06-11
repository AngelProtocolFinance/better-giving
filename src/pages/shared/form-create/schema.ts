import * as v from "valibot";
import { $, $req } from "@/schemas";

export const schema = v.object({
  tag: $req,
  /** selector */
  program: v.union([$, v.pipe($, v.uuid("internal: invalid program id"))]),
});

export interface FV extends v.InferOutput<typeof schema> {}
