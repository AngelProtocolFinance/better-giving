import type { ActionFunction } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { endowUpdate } from "#/pages/admin/endow-update-action";
import type { EndowmentSettingsAttributes } from "#/types/npo";
import { resp } from "@/helpers/https";
import type { INpo } from "$/pg/queries/npo";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export interface LoaderData
  extends Pick<INpo, "id" | EndowmentSettingsAttributes> {}

export const loader = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);

  const n = await npo_get(id);
  if (!n) throw resp.status(404);
  return { ...n, id } satisfies LoaderData;
};

export const action: ActionFunction = endowUpdate({
  success: "Settings updated",
});
