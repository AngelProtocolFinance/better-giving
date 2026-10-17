import { safeParse, union } from "valibot";
import { resp } from "@/helpers/https";
import { $int_gte1, segment_shape } from "@/schemas";

export const npo_id = (id_or_slug: string) => {
  const p = safeParse(union([segment_shape, $int_gte1]), id_or_slug);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  return p.output;
};
