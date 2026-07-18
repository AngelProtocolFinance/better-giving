import { dash } from "@better-auth/infra";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq, sql } from "drizzle-orm";
import { cognito_signup, reset_password } from "emails";
import { referral_id } from "#/helpers/referral";
import { send_email } from "$/email";
import { app, base_url, better_auth, google } from "$/env";
import { db } from "$/pg/db";
import * as schema from "$/pg/schema";

export const auth = betterAuth({
  secret: app.session_secret,
  baseURL: base_url,
  basePath: "/api/auth",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  experimental: {
    joins: true, // Enable database joins for better performance
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    async sendResetPassword({ user, url }) {
      const { node, subject } = reset_password.template({
        first_name: user.name.split(" ")[0] || user.name,
        url,
      });
      await send_email({ node, to: [user.email], subject });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
  },

  socialProviders: {
    google: {
      clientId: google.client_id,
      clientSecret: google.client_secret,
      // map google profile to required user fields
      // https://www.better-auth.com/docs/concepts/oauth#map-profile-to-user
      mapProfileToUser(profile) {
        return {
          first_name: profile.given_name || profile.name?.split(" ")[0] || "",
          last_name:
            profile.family_name ||
            profile.name?.split(" ").slice(1).join(" ") ||
            "",
        };
      },
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  plugins: [
    emailOTP({
      storeOTP: "hashed", // Use hashed storage for OTPs
      otpLength: 6,
      expiresIn: 300, // 5 min
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "forget-password") return; // handled by sendResetPassword
        const { node } = cognito_signup.template({ code: otp });
        await send_email({
          node,
          to: [email],
          subject: "Verify your Better Giving account",
        });
      },
    }),
    admin(),
    dash({ apiKey: better_auth.api_key }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min cache to reduce db hits
      strategy: "jwe",
    },
  },

  user: {
    additionalFields: {
      first_name: { type: "string", required: true },
      last_name: { type: "string", required: true },
      referral_code: { type: "string", required: false, unique: true },
      pref_currency: {
        type: "string",
        required: false,
        defaultValue: "usd",
      },
      avatar_url: { type: "string", required: false },
      pay_id: { type: "string", required: false },
      pay_min: { type: "number", required: false, defaultValue: 0 },
      w_form: { type: "string", required: false },
      signup_date: { type: "string", required: false },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // generate referral code for new users (replaces post-confirm Lambda)
          const code = referral_id();
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

export type Auth = typeof auth;
