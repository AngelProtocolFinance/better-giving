import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "#/.server/auth/auth";
import { report_error } from "@/errors/report";

export const auth_client = createAuthClient({
  plugins: [emailOTPClient()],
  fetchOptions: {
    onError: (ctx) => {
      report_error(ctx.error);
    },
  },
});

export type Session = typeof auth.$Infer.Session;
