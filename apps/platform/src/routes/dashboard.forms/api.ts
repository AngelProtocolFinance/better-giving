import { user_ctx } from "#/.server/auth";
import { forms_owned_by } from "$/pg/queries/form";
import type { Route } from "./+types/route";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const params = new URL(request.url).searchParams;
  const raw = params.get("status");
  const status = raw === "active" || raw === "inactive" ? raw : undefined;
  const next = params.get("next") ?? undefined;
  const forms = await forms_owned_by(user.id, { status, next });
  return { ...forms, status: status ?? "all" };
};
