import { admin_ctx } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { donor_detail } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";

export const loader = async (x: Route.LoaderArgs) => {
  const npo_id = x.context.get(admin_ctx);
  const email = decodeURIComponent(x.params.email);

  const detail = await donor_detail(npo_id, email);
  if (!detail) throw resp.status(404, "Donor not found");

  return detail;
};
