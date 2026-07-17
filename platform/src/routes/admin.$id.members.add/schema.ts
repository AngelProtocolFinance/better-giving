import * as v from "valibot";
import { $req } from "@/schemas";
export const schema = (added: string[]) =>
  v.object({
    first_name: $req,
    last_name: $req,
    email: v.pipe(
      $req,
      v.email("invalid email"),
      v.check((input) => !added.includes(input), "already a member")
    ),
  });

export interface ISchema extends v.InferOutput<ReturnType<typeof schema>> {}
