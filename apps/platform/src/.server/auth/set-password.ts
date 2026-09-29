import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";

/** the operator routes that write a user's password. neither revokes sessions
 * itself, and `revokeSessionsOnPasswordReset` only reaches `/reset-password`. */
const ADMIN_PATH = "/admin/set-user-password";
const DASH_PATH = "/dash/set-password";

interface IHookCtx {
  path?: string;
  body?: unknown;
  context: object;
}

const target_of = (ctx: IHookCtx): string | undefined => {
  if (ctx.path === ADMIN_PATH)
    return (ctx.body as { userId?: string } | undefined)?.userId;
  // dash names its target in the verified jwt, not the body. its `use`
  // middleware assigns that payload onto the context the after hooks share.
  if (ctx.path === DASH_PATH) {
    return (ctx.context as { payload?: { userId?: string } }).payload?.userId;
  }
};

/** a password an operator sets is a reset done on the user's behalf — often
 * because the account is compromised — so it evicts every session the user
 * holds, as a self-service reset does. */
export const revoke_sessions_on_set_password = () =>
  ({
    id: "revoke-sessions-on-set-password",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === ADMIN_PATH || ctx.path === DASH_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            // the dispatcher turns a refusal into `returned`; only a password
            // that was actually written evicts anyone.
            if (isAPIError(ctx.context.returned)) return;
            const user_id = target_of(ctx);
            if (user_id) {
              await ctx.context.internalAdapter.deleteUserSessions(user_id);
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
