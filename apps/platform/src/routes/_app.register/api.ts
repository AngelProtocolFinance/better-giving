import { get_session, to_auth } from "#/.server/auth";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);
  return user;
};
