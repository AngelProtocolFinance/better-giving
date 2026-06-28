import * as v from "valibot";
import { img_output } from "#/components/img-editor";

export const schema = v.object({
  first_name: v.pipe(v.string("required"), v.nonEmpty("required")),
  last_name: v.pipe(v.string("required"), v.nonEmpty("required")),
  avatar_url: img_output(),
});

export interface FV extends v.InferOutput<typeof schema> {}
