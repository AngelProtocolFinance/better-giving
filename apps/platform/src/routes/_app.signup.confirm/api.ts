import { valibotResolver } from "@hookform/resolvers/valibot";
import { type ActionFunction, href, redirect } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { auth, get_session } from "#/.server/auth";
import { dataWithError } from "#/.server/toast";
import type { IFormInvalid } from "#/types/action";
import { type ISignUpConfirm, signup_confirm } from "#/types/auth";
import { report_error } from "@/errors/report";
import { search } from "@/helpers/https";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (user) return redirect(href("/marketplace"));

  const { email } = search(request);
  if (!email) return redirect(href("/signup"));

  return { email };
};

export const action: ActionFunction = async ({ request }) => {
  const from = new URL(request.url);
  const fv = await request.formData();
  const email = fv.get("email");
  if (!email) throw new Error("@dev: email is required to resend OTP");

  if (fv.get("intent") === "resend-otp") {
    try {
      await auth.api.sendVerificationOTP({
        body: { email: email.toString(), type: "email-verification" },
      });
      return { time_remaining: 30 };
    } catch (err) {
      report_error(err);
      return dataWithError(null, "Failed to resend code");
    }
  }

  const p = await getValidatedFormData<ISignUpConfirm>(
    fv,
    valibotResolver(signup_confirm),
    true
  );
  if (p.errors) return p;

  try {
    await auth.api.verifyEmailOTP({
      body: { email: email.toString(), otp: p.data.code },
    });
  } catch {
    return {
      receivedValues: p.receivedValues,
      errors: { code: { type: "value", message: "Invalid or expired code" } },
    } satisfies IFormInvalid<ISignUpConfirm>;
  }

  from.searchParams.delete("email");
  const to = new URL(from);
  to.pathname = href("/signup/success");
  return redirect(to.toString());
};
