import { auth } from "./auth";
import type { AuthUser } from "./middleware";

// drop-in replacement for cognito.retrieve(request)
// returns { user, headers } to match existing call sites
export async function get_session(request: Request): Promise<{
  user: AuthUser | undefined;
}> {
  const session = await auth.api.getSession({ headers: request.headers });
  return { user: session?.user };
}
