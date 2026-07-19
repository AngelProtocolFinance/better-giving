import type { LoaderFunctionArgs } from "react-router";
import { get_session } from "#/.server/auth";
import { user_get } from "$/pg/queries/user";

// slim session probe for chrome consumers (header avatar + signed-in state).
// keep separate from /api/me so nav doesn't pay for bookmark/org queries.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { user } = await get_session(request);

  if (!user) {
    return Response.json(
      { signed_in: false },
      { headers: { "cache-control": "private, no-store" } }
    );
  }

  // fresh avatar from db so a profile edit reflects in the header
  const db_user = await user_get(user.email);

  return Response.json(
    { signed_in: true, avatar_url: db_user?.avatar_url },
    { headers: { "cache-control": "private, no-store" } }
  );
};
