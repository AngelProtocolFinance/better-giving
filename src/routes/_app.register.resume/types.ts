import { type InferOutput, object, pipe } from "valibot";
import { reg_id } from "@/reg/schema";
import { $req } from "@/schemas";

export const schema = object({ reference: pipe($req, reg_id) });

export interface FV extends InferOutput<typeof schema> {}
