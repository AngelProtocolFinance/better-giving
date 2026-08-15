import { auth } from "./auth";
import { client_ip, consume, type Quota } from "./rate-limit";

/** how many rows one source may open in a window. per-ip only, deliberately:
 * this call is idempotent per address, so a per-email bucket would be spent
 * once and never again — it cannot bind on the abuse that matters, which is one
 * source opening rows for many *distinct* addresses.
 *
 * Sized for shared egress rather than for one person. Carrier-grade NAT puts
 * thousands of mobile subscribers behind a single address, so the donor on a
 * phone — not the office — is what sets this floor. An hour-long window also
 * smooths an organically bursty afternoon (a staff onboarding, a conference
 * table) that a short window would clip. A script crosses it in under a
 * second, and the asymmetry settles the ties: a false positive is a customer
 * who thinks we are broken, a false negative is some junk rows. */
export const CREATE_PER_IP: Quota = { max: 60, window_s: 60 * 60 };

export interface UnverifiedUserInput {
  email: string;
  first_name?: string;
  last_name?: string;
  /** the caller's own request headers, for the client ip the quota keys on.
   * absent, or behind a proxy that sets neither forwarding header, this falls
   * open — a single shared bucket would throttle every lead at once, which is
   * worse than the flood it would prevent. */
  headers?: Headers;
}

export type UnverifiedUserResult =
  /** a brand-new, empty, password-less account — safe to let the caller
   * proceed straight into the flow that created it */
  | { status: "created"; user_id: string }
  /** the address already has an unverified account. reused, never duplicated. */
  | { status: "existing"; user_id: string }
  /** a verified account owns the address — nothing was created */
  | { status: "verified" }
  /** the source asked for too many new rows and this one was refused.
   * carries no `user_id` for the same reason `verified` doesn't — there is no
   * account here the caller may act as. Callers must answer this exactly as
   * they answer `existing` and `verified`: every branch but `created` already
   * lands on the same "check your inbox", so a refusal is not distinguishable
   * from an address that was already taken. */
  | { status: "throttled" };

export async function create_unverified_user(
  input: UnverifiedUserInput
): Promise<UnverifiedUserResult> {
  const email = input.email.trim().toLowerCase();
  const ctx = await auth.$context;

  const existing = await settle(ctx, email, input);
  if (existing) return existing;

  // gated here rather than at the top: past `settle` the address is new by
  // definition, so this is the only call that will actually write a row. an
  // address resubmitted ten times costs one row and must cost one token.
  const ip = input.headers && client_ip(input.headers);
  if (ip && !consume(`unverified-user:ip:${ip}`, CREATE_PER_IP)) {
    return { status: "throttled" };
  }

  try {
    const created = await ctx.internalAdapter.createUser({
      email,
      // `name`, `first_name`, `last_name` are NOT NULL — a lead that only gave
      // an address gets empty strings, filled in later by the wizard.
      name: [input.first_name, input.last_name].filter(Boolean).join(" "),
      first_name: input.first_name ?? "",
      last_name: input.last_name ?? "",
      emailVerified: false,
    });
    return { status: "created", user_id: created.id };
  } catch (err) {
    // two submits of the same address can race past the lookup; the unique
    // index on user.email is the real arbiter, so the loser re-reads rather
    // than surfacing a 500.
    const raced = await settle(ctx, email, input);
    if (raced) return raced;
    throw err;
  }
}

/** the name columns as this app declares them — better-auth's `User` only
 * knows the ones it owns, so the additional fields need naming here. */
type NamedUser = { id: string; name: string } & Record<
  "first_name" | "last_name",
  string
>;

async function settle(
  ctx: Awaited<typeof auth.$context>,
  email: string,
  input: UnverifiedUserInput
): Promise<UnverifiedUserResult | null> {
  const found = await ctx.internalAdapter.findUserByEmail(email);
  if (!found) return null;
  if (found.user.emailVerified) return { status: "verified" };
  await backfill_names(ctx, found.user as unknown as NamedUser, input);
  return { status: "existing", user_id: found.user.id };
}

/** a row created from an address-only lead form carries empty name columns, and
 * the same address arriving through a form that does ask is the only chance to
 * fill them. a name already on the row always wins — this fills blanks, it does
 * not let a later submission rewrite an identity. */
async function backfill_names(
  ctx: Awaited<typeof auth.$context>,
  user: NamedUser,
  input: UnverifiedUserInput
): Promise<void> {
  const patch: Partial<NamedUser> = {};
  if (!user.first_name && input.first_name) patch.first_name = input.first_name;
  if (!user.last_name && input.last_name) patch.last_name = input.last_name;

  const full = [
    patch.first_name ?? user.first_name,
    patch.last_name ?? user.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  if (!user.name && full) patch.name = full;

  if (Object.keys(patch).length === 0) return;
  await ctx.internalAdapter.updateUser(user.id, patch);
}
