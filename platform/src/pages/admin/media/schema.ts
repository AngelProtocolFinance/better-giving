import { type InferOutput, object, pipe, url } from "valibot";
import { $req } from "@/schemas";

export const schema = object({ url: pipe($req, url("invalid url")) });
export interface ISchema extends InferOutput<typeof schema> {}
