import * as v from "valibot";
import { img_output } from "#/components/img-editor";
import { richtext_content } from "#/types/components";
import { $req } from "@/schemas";
import { MAX_CHARS } from "../common";

export const schema = v.object({
  date: v.pipe(
    v.string(),
    v.transform((x) => new Date(x)),
    v.date("invalid date"),
    v.transform((x) => x.toISOString())
  ),
  description: richtext_content({ maxChars: MAX_CHARS, required: true }),
  title: $req,
  media: img_output(),
});

export interface FV extends v.InferOutput<typeof schema> {}
