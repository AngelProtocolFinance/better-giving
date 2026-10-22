import { check, type InferOutput, object, pipe, url } from "valibot";
import { extract_youtube_id } from "#/components/youtube-player";
import { $req } from "@/schemas";

export const schema = object({
  url: pipe(
    $req,
    url("invalid url"),
    check(
      (x) => extract_youtube_id(x) !== null,
      "only YouTube links are supported"
    )
  ),
});
export interface ISchema extends InferOutput<typeof schema> {}
