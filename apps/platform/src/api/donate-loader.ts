import { data, type LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { type AuthUser, get_session } from "#/.server/auth";
import { resp, search } from "@/helpers/https";
import type { IProgram } from "@/npo";
import { program_id } from "@/npo/schema";
import { $int_gte1 } from "@/schemas";
import { type INpoPublic, npo_get, npo_public } from "$/pg/queries/npo";
import { npo_program_get, npo_program_owned } from "$/pg/queries/program";

export interface DonateData {
  id: number;
  endow: INpoPublic;
  /** need to await */
  program?: IProgram;
  user?: AuthUser;
  base_url: string;
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { programId } = search(request);
  const p1 = v.safeParse(v.optional(program_id), programId);
  if (p1.issues) throw resp.status(400, p1.issues[0].message);
  const pid = p1.output;
  const p2 = v.safeParse($int_gte1, params.id);
  if (p2.issues) throw resp.status(400, p2.issues[0].message);
  const id = p2.output;
  const endow = await npo_get(id);
  if (!endow) throw new Response(null, { status: 404 });

  const { user } = await get_session(request);
  // another npo's program is dropped, not refused: the link still reaches this npo
  const program =
    pid && (await npo_program_owned(id, pid))
      ? await npo_program_get(pid)
      : undefined;

  return data({
    id,
    endow: npo_public(endow),
    program,
    user,
    base_url: new URL(request.url).origin,
  } satisfies DonateData);
};
