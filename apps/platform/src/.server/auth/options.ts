import { magicLink } from "better-auth/plugins/magic-link";
import { eq, sql } from "drizzle-orm";
import { db } from "$/pg/db";
import * as schema from "$/pg/schema";

/** how long a verification / sign-in link stays good. the email copy quotes
 * this same number — change both together. */
export const LOGIN_LINK_TTL_S = 60 * 60;
export const LOGIN_LINK_TTL_COPY = "1 hour";

/** and how long the one carried by the welcome mail does. that mail is opened
 * on somebody's own schedule — the next morning, after the weekend — so the
 * login form's hour is the wrong unit for it. three days clears a lead who
 * applies on a Friday afternoon, and expiry is no longer a dead end: a stale
 * token lands on the check-email screen, which resends.
 *
 * It is a *separate* number rather than a longer `LOGIN_LINK_TTL_S` because
 * better-auth's `expiresIn` is plugin-global — raising it would lengthen every
 * link `/login` mints too. `../auth/resume-link` is what makes a per-link
 * lifetime possible at all; see the note there. */
export const RESUME_LINK_TTL_S = 60 * 60 * 24 * 3;

/** how a sign-in token is keyed in the verification store.
 *
 * Named and shared rather than left on `storeToken: "hashed"` so the plugin and
 * `mint_resume_link` cannot drift: minting derives the row's identifier with
 * this, and the plugin's `/magic-link/verify` looks it up with the same call.
 * Byte-identical to better-auth's own default hasher (SHA-256, base64url, no
 * padding), so links already in flight at deploy still resolve. */
export const hash_link_token = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export interface AuthOptionDeps {
  /** renders + sends the one email that carries a login/verification link */
  send_login_link(a: { email: string; url: string }): Promise<void>;
  referral_id(): string;
}

/** the whole verification story: single-use, ttl-bound, and it both proves the
 * address and signs the person in. kept out of `auth_options` so callers build
 * a literal plugin tuple — better-auth infers its api surface from that tuple,
 * and a widened array silently strips `role`, `verifyEmail` and friends. */
export const login_link_plugin = (deps: AuthOptionDeps) =>
  magicLink({
    expiresIn: LOGIN_LINK_TTL_S,
    // the stored row is what makes the link single-use; hashing it means a
    // leaked db row can't be replayed as a token.
    storeToken: { type: "custom-hasher", hash: hash_link_token },
    // asking for a link must never mint a user — every row comes from an
    // explicit signup or `create_unverified_user`, which are the two places
    // abuse protection actually lives.
    disableSignUp: true,
    async sendMagicLink({ email, url }) {
      await deps.send_login_link({ email, url });
    },
  });

/** `required` must stay a literal — better-auth derives the signUp body type
 * from it, and a widened `boolean` makes every optional column mandatory. the
 * same holds for `input`, which is why it is named in the constraint below
 * rather than left to the index signature: an `input: boolean` field is one
 * better-auth's client types still offer as writable. */
const user_additional_fields = {
  first_name: { type: "string", required: true },
  last_name: { type: "string", required: true },
  // the code referral attribution and payouts key on. minted server-side in
  // the `user.create.after` hook below and `unique`, so a client-set value can
  // collide with — or claim — another referrer's.
  referral_code: {
    type: "string",
    required: false,
    unique: true,
    input: false,
  },
  pref_currency: { type: "string", required: false, defaultValue: "usd" },
  avatar_url: { type: "string", required: false },
  // the payout destination and the signed-w-9 handle are server-owned:
  // `pay_id` names the wise recipient money is sent to, and `w_form` is the
  // anvil eid `/api/anvil-doc/$eid` hands a taxpayer's w-9 back for. an
  // additional field is client-writable on `/update-user` by default, which
  // would let any signed-in user point either at somebody else's. the routes
  // that legitimately set them go through `user_update` — raw drizzle, not
  // better-auth — and `internalAdapter.updateUser` skips this parse too.
  pay_id: { type: "string", required: false, input: false },
  pay_min: { type: "number", required: false, defaultValue: 0, input: false },
  w_form: { type: "string", required: false, input: false },
  // stamped by the same hook. a record about the user, not one they author.
  signup_date: { type: "string", required: false, input: false },
} satisfies Record<
  string,
  {
    type: "string" | "number";
    required: boolean;
    input?: false;
    [k: string]: unknown;
  }
>;

/** the config the auth tests exercise. env-bound pieces (secret, baseURL,
 * database, google, dash) are layered on in `auth.ts` — everything that
 * decides *behaviour* lives here so a test can build the same instance. */
export const auth_options = (deps: AuthOptionDeps) => ({
  experimental: {
    joins: true,
  },

  emailAndPassword: {
    enabled: true,
    // password accounts still must prove the address. the proof is the link,
    // not a typed code — and leaving `emailVerification.sendVerificationEmail`
    // unset is what keeps it that way: better-auth checks that first and
    // throws EMAIL_NOT_VERIFIED outright, so it never mails its own stateless
    // jwt link and the route is free to send ours.
    requireEmailVerification: true,
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min cache to reduce db hits
      strategy: "jwe" as const,
    },
  },

  user: { additionalFields: user_additional_fields },

  /** covers the public `/api/auth/*` surface only — better-auth runs this from
   * its router's `onRequest`, which a server-side `auth.api.*` call never
   * touches. The app-side counterpart for those lives in `./rate-limit`.
   *
   * Left on the default `enabled` (production only) so dev and the test suite
   * are not throttled, and on the default in-memory storage, which is
   * per-instance on serverless — see `./rate-limit` for the same caveat. */
  rateLimit: {
    customRules: {
      // each one of these mails something. the plugin's own default is 5/60s;
      // no human needs more than a few links per quarter hour.
      "/sign-in/magic-link": { window: 15 * 60, max: 5 },
      "/sign-up/email": { window: 15 * 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      // token guessing. the token is 32 random chars, so this is only a brake
      // on volume, not the thing making the token unguessable.
      "/magic-link/verify": { window: 60, max: 10 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user: { id: string; email: string }) => {
          // generate referral code for new users
          const code = deps.referral_id();
          await db.execute(
            sql`UPDATE "user" SET referral_code = ${code}, signup_date = NOW() WHERE id = ${user.id}`
          );

          // consume any pending NPO invites for this email regardless of
          // expire_at. the 5-minute window in npo_admin_tx only bounds the
          // visibility of pending rows in the members list — once the
          // invitee actually signs up the invitor's intent should be honored.
          await db.transaction(async (tx) => {
            const invites = await tx
              .select()
              .from(schema.user_invites)
              .where(eq(schema.user_invites.invitee, user.email));
            for (const inv of invites) {
              if (inv.npo_id != null) {
                await tx
                  .insert(schema.user_npo_memberships)
                  .values({ user_id: user.id, npo_id: inv.npo_id })
                  .onConflictDoNothing();
              }
            }
            await tx
              .delete(schema.user_invites)
              .where(eq(schema.user_invites.invitee, user.email));
          });
        },
      },
    },
  },

  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
    ipAddress: {
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
    },
  },
});
