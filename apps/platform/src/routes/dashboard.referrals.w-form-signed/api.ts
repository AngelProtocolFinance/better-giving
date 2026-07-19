import { user_ctx } from "#/.server/auth";
import { weld_data_fn } from "#/.server/registration/weld-data";
import { user_update } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export interface LoaderData {
  doc_eid: string;
}

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const q = new URL(request.url).searchParams;
  const weld_data_eid = q.get("weldDataEid");
  if (!weld_data_eid) throw new Response(null, { status: 400 });
  const { documentGroup } = await weld_data_fn(weld_data_eid);

  if (documentGroup.eid) {
    await user_update(user.email, { w_form: documentGroup.eid });
  }

  return { doc_eid: documentGroup.eid } satisfies LoaderData;
};
