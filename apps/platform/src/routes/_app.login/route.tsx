import { valibotResolver } from "@hookform/resolvers/valibot";
import { eq } from "drizzle-orm";
import { Mail } from "lucide-react";
import { href, Link, redirect, useNavigation } from "react-router";
import { getValidatedFormData, useRemixForm } from "remix-hook-form";
import { auth, get_session } from "#/.server/auth";
import { dataWithError } from "#/.server/toast";
import googleIcon from "#/assets/icons/google.svg";
import { ExtLink } from "#/components/ext-link";
import { Input, PasswordInput, RmxForm } from "#/components/form";
import { Image } from "#/components/image";
import { Separator } from "#/components/separator";
import { metas } from "#/helpers/seo";
import type { IFormInvalid } from "#/types/action";
import { type ISignIn, sign_in } from "#/types/auth";
import { report_error } from "@/errors/report";
import { search } from "@/helpers/https";
import { db } from "$/pg/db";
import { account, user as userTable } from "$/pg/schema/auth";
import type { Route } from "./+types/route";

export const action = async ({ request }: Route.ActionArgs) => {
  try {
    const from = new URL(request.url);
    const redirect_to =
      from.searchParams.get("redirect") || href("/marketplace");
    const { user } = await get_session(request);
    if (user) return redirect(redirect_to);

    const fv = await request.formData();

    if (fv.get("intent") === "oauth") {
      const res = await auth.api.signInSocial({
        body: { provider: "google", callbackURL: redirect_to },
        headers: request.headers,
        asResponse: true,
      });
      // must forward set-cookie so browser receives state/pkce cookie
      // https://www.better-auth.com/docs/reference/errors/state_mismatch
      const location = res.headers.get("location");
      if (location) {
        const headers = new Headers();
        const cookie = res.headers.get("set-cookie");
        if (cookie) headers.set("set-cookie", cookie);
        return redirect(location, { headers });
      }
      return redirect(redirect_to);
    }

    const payload = await getValidatedFormData<ISignIn>(
      fv,
      valibotResolver(sign_in)
    );
    if (payload.errors) return payload;

    const res = await auth.api.signInEmail({
      body: {
        email: payload.data.email.toLowerCase(),
        password: payload.data.password,
      },
      asResponse: true,
    });

    if (!res.ok) {
      const err = await res.json();

      // unverified user — send fresh OTP and redirect to confirm page
      if (err.code === "EMAIL_NOT_VERIFIED") {
        const email = payload.data.email.toLowerCase();
        await auth.api.sendVerificationOTP({
          body: { email, type: "email-verification" },
        });
        return redirect(
          `${href("/signup/confirm")}?email=${encodeURIComponent(email)}`
        );
      }

      // migrated user: exists in user table but has zero account rows
      if (err.code === "INVALID_EMAIL_OR_PASSWORD") {
        const email = payload.data.email.toLowerCase();
        const [row] = await db
          .select({ id: userTable.id })
          .from(userTable)
          .where(eq(userTable.email, email));

        if (row) {
          const [acct] = await db
            .select({ id: account.id })
            .from(account)
            .where(eq(account.userId, row.id));

          if (!acct) {
            const origin = new URL(request.url).origin;
            try {
              await auth.api.requestPasswordReset({
                body: {
                  email,
                  redirectTo: `${origin}/login/reset?type=set-password&email=${encodeURIComponent(email)}`,
                },
              });
            } catch {
              // fall through to generic error if reset email fails
            }

            const reset_url = new URL(`${origin}/login/reset`);
            reset_url.searchParams.set("type", "migrated");
            reset_url.searchParams.set("email", email);
            const redir = from.searchParams.get("redirect");
            if (redir) reset_url.searchParams.set("redirect", redir);
            return redirect(reset_url.toString());
          }
        }
      }

      return {
        errors: {
          password: {
            type: "value",
            message: err.message || "Invalid credentials",
          },
        },
        receivedValues: payload.receivedValues,
      } satisfies IFormInvalid<ISignIn>;
    }

    const headers = new Headers();
    const cookie = res.headers.get("set-cookie");
    if (cookie) headers.set("set-cookie", cookie);
    return redirect(redirect_to, { headers });
  } catch (err) {
    report_error(err);
    return dataWithError(null, "Unknown error occurred", { status: 500 });
  }
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  const { redirect: to } = search(request);
  if (user) return redirect(to || href("/marketplace"));
  return to || "/";
};

export const meta: Route.MetaFunction = () =>
  metas({ title: "Login - Better Giving" });

export { ErrorBoundary } from "#/components/error";
export default function Page({ loaderData: to }: Route.ComponentProps) {
  const nav = useNavigation();

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useRemixForm<ISignIn>({
    resolver: valibotResolver(sign_in),
  });

  const form_id = "signin-form";
  const is_submitting = nav.state !== "idle";

  return (
    <div className="grid justify-items-center gap-3.5 px-4 py-14 text-muted-fg">
      <div className="grid w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
        <h3 className="text-center text-2xl font-bold">
          Philanthropy for Everyone
        </h3>
        <p className="text-center max-sm:text-sm mt-2">
          Log in to support great causes or register and manage your nonprofit.
        </p>
        <RmxForm disabled={is_submitting} method="POST" className="contents">
          <button
            name="intent"
            value="oauth"
            type="submit"
            className="flex-center btn-secondary btn rounded gap-2 h-12 sm:h-13 mt-6"
          >
            <Image src={googleIcon} height={18} width={18} />
            <span className="font-semibold">Continue with Google</span>
          </button>
        </RmxForm>
        <Separator classes="my-4 before:mr-3.5 after:ml-3.5 before:bg-border after:bg-border font-medium text-xs text-muted-fg">
          OR
        </Separator>
        <RmxForm
          id={form_id}
          onSubmit={handleSubmit}
          method="POST"
          disabled={is_submitting}
          className="grid gap-3"
        >
          <Input
            {...register("email")}
            placeholder="Email address"
            autoComplete="username"
            icon={Mail}
            error={errors.email?.message}
          />
          <PasswordInput
            {...register("password")}
            error={errors.password?.message}
            placeholder="Password"
          />
          <Link
            to={`${href("/login/reset")}?redirect=${to}`}
            className="font-medium text-muted-fg hover:text-fg active:text-fg text-xs sm:text-sm justify-self-end hover:underline"
          >
            Forgot password?
          </Link>
        </RmxForm>
        <button
          disabled={is_submitting}
          form={form_id}
          type="submit"
          className="flex-center btn-primary h-12 sm:h-13 rounded sm:text-lg font-bold w-full mt-4"
        >
          Log In
        </button>
        <span className="flex-center gap-1 max-sm:text-sm mt-8">
          Don't have an account?
          <Link
            to={`${href("/signup")}?redirect=${to}`}
            className="text-primary hover:text-primary active:text-primary aria-disabled:text-muted-fg font-medium underline"
            aria-disabled={is_submitting}
          >
            Sign up
          </Link>
        </span>
      </div>
      <span className="text-xs sm:text-sm text-center w-80">
        By signing in, you agree to our{" "}
        <ExtLink
          href={href("/privacy-policy")}
          className="text-primary hover:text-primary/80"
        >
          Privacy Policy
        </ExtLink>
        ,{" "}
        <ExtLink
          href={href("/terms-of-use")}
          className="text-primary hover:text-primary/80"
        >
          Terms of Use (Donors)
        </ExtLink>
        , and{" "}
        <ExtLink
          href={href("/terms-of-use-npo")}
          className="text-primary hover:text-primary/80"
        >
          Terms of Use (Nonprofits)
        </ExtLink>
      </span>
    </div>
  );
}
