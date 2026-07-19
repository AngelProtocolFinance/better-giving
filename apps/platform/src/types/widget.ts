import * as v from "valibot";
import { donate_method_id } from "@/npo/schema";
import { increment_label, increment_val } from "@/schemas";

const str = v.pipe(v.string(), v.trim());

const title = v.pipe(str, v.maxLength(100, "cannot exceed 100 characters"));
const description = v.pipe(
  str,
  v.maxLength(300, "cannot exceed 300 characters")
);

const bool_str = v.pipe(v.string(), v.parseBoolean());

export const widget_search = v.object({
  isDescriptionTextShown: v.optional(bool_str),

  // v2.3 params //
  methods: v.optional(
    v.pipe(
      str, //csv of method ids
      v.transform((x) => x.split(",")),
      v.everyItem((x) => v.safeParse(donate_method_id, x).success)
    )
  ),
  title: v.optional(title),
  description: v.optional(description),
  isTitleShown: v.optional(bool_str),
  accentPrimary: v.optional(v.pipe(str, v.hexColor())),
  accentSecondary: v.optional(v.pipe(str, v.hexColor())),
  programId: v.optional(v.pipe(str, v.uuid())),
  increments: v.optional(
    v.pipe(
      str, //csv of increments e.g. 40, 100, 500
      v.transform((x) => x.split(",")),
      v.everyItem((x) => v.safeParse(increment_val, x).success)
    )
  ),
  descriptions: v.optional(
    v.pipe(
      str,
      //csv of descriptions,
      v.transform((x) => x.split(",")),
      // bring back commas replaced in snippet generation
      v.mapItems((x) => x.replace(/_/g, ",")),
      v.everyItem((x) => v.safeParse(increment_label, x).success)
    )
  ),
});

export interface IWidgetSearchObj extends v.InferOutput<typeof widget_search> {}
