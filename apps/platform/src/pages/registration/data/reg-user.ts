import { type AuthUser, get_registrant, get_session } from "#/.server/auth";

export interface IRegUser {
  user: AuthUser;
  /** resolved from a draft grant rather than a session — the address behind
   * this application has not been proven yet */
  grant: boolean;
}

/** Who may act on an application.
 *
 * A session always wins. The contact step also answers to a draft grant,
 * because it is the one step that runs before the address is proven; every
 * other surface passes `false` and stays session-only, so the grant never
 * becomes a second key to the app. Ownership is still the caller's to check —
 * this only says who is asking. */
export const reg_user = async (
  request: Request,
  allow_grant: boolean
): Promise<IRegUser | null> => {
  const { user } = await get_session(request);
  if (user) return { user, grant: false };
  if (!allow_grant) return null;
  const registrant = await get_registrant(request);
  return registrant ? { user: registrant, grant: true } : null;
};
