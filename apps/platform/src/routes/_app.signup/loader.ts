import { href, redirect } from "react-router";
import { get_session } from "#/.server/auth";
import { safe_redirect } from "@/helpers/safe-redirect";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  const from = new URL(request.url);
  const redirect_to = safe_redirect(from.searchParams.get("redirect"), null);
  if (user) return redirect(redirect_to || href("/marketplace"));
  return redirect_to || "/";
};
