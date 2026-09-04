import { auth } from "./auth";
import type { AuthUser } from "./middleware";

export async function get_session(request: Request): Promise<{
  user: AuthUser | undefined;
}> {
  const session = await auth.api.getSession({ headers: request.headers });
  return { user: session?.user };
}
