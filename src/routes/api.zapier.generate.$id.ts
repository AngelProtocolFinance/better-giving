import type { LoaderFunctionArgs } from "react-router";
import { safeParse } from "valibot";
import { get_session } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { api_key_put } from "$/pg/queries/api-key";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { user } = await get_session(request);
  if (!user || user.role !== "admin") {
    return new Response(null, { status: 401 });
  }

  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const key = await api_key_put(id);
  return new Response(key);
}
