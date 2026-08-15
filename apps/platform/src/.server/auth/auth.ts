import { dash } from "@better-auth/infra";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { login_link, reset_password } from "emails";
import { referral_id } from "#/helpers/referral";
import { send_email } from "$/email";
import { app, base_url, better_auth, google } from "$/env";
import { db } from "$/pg/db";
import * as schema from "$/pg/schema";
import {
  auth_options,
  LOGIN_LINK_TTL_COPY,
  login_link_plugin,
} from "./options";

const deps = {
  referral_id,
  async send_login_link({ email, url }: { email: string; url: string }) {
    const { node, subject } = login_link.template({
      url,
      expires_in: LOGIN_LINK_TTL_COPY,
    });
    await send_email({ node, to: [email], subject });
  },
};

const base = auth_options(deps);

export const auth = betterAuth({
  ...base,
  secret: app.session_secret,
  baseURL: base_url,
  basePath: "/api/auth",
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    ...base.emailAndPassword,
    async sendResetPassword({ user, url }) {
      const { node, subject } = reset_password.template({
        first_name: user.name.split(" ")[0] || user.name,
        url,
      });
      await send_email({ node, to: [user.email], subject });
    },
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
    login_link_plugin(deps),
    admin(),
    dash({ apiKey: better_auth.api_key }),
  ],
});

export type Auth = typeof auth;
