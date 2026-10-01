import { maxLength, object, pipe } from "valibot";
import { $req } from "@/schemas";

export const cancel_fv = object({
  reason: pipe($req, maxLength(500, "must be 500 characters or fewer")),
});
