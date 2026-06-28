import * as v from "valibot";
import { img_output } from "#/components/img-editor";

export const schema = v.object({
  firstName: v.pipe(v.string("required"), v.nonEmpty("required")),
  lastName: v.pipe(v.string("required"), v.nonEmpty("required")),
  avatar: img_output(),
});

export interface FV extends v.InferOutput<typeof schema> {}
