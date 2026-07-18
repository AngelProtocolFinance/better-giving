import { href, redirect } from "react-router";
import { get_session } from "#/.server/auth";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  const from = new URL(request.url);
  const redirect_to = from.searchParams.get("redirect");
  if (user) return redirect(redirect_to || href("/marketplace"));
  return redirect_to || "/";
};
