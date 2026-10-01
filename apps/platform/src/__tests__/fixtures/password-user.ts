import type { Auth } from "#/.server/auth/auth";

export interface PasswordUser {
  email: string;
  password: string;
  name: string;
  first_name: string;
  last_name: string;
}

/** a user row with a credential account, as `/sign-up/email` would have made
 * it — unverified. that endpoint is disabled in config, so the rows go in
 * through the internal adapter, whose `createUser` still runs the
 * `user.create` hooks. */
export async function seed_password_user(
  auth: Pick<Auth, "$context">,
  { email, password, ...names }: PasswordUser
) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email: email.toLowerCase(),
    emailVerified: false,
    ...names,
  });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  return user;
}
