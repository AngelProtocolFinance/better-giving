import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { Input } from "#/components/form";
import { use_counter } from "#/hooks/use-counter";
import type { ISignUpConfirm } from "#/types/auth";
import type { Route } from "./+types/route";

const MAX_TIME = 30;

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;
  const fetcher = useFetcher();
  const { counter, reset_counter } = use_counter(MAX_TIME);
  useEffect(() => {
    if (fetcher.data?.time_remaining) reset_counter();
  }, [fetcher.data, reset_counter]);

  const form_id = "sign-up-confirm-form";
  const {
    register,
    formState: { errors },
  } = useRemixForm<ISignUpConfirm>({ fetcher });

  return (
    <div className="grid w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
      <h3 className="text-center text-xl sm:text-2xl font-bold">
        Verify your account
      </h3>
      <p className="text-center max-sm:text-sm mt-2">
        You are almost there! 6-digit security code has been sent to{" "}
        <span className="font-medium">{obscure_email(email)}</span>
      </p>
      <fetcher.Form id={form_id} className="contents" method="POST">
        <input readOnly name="email" value={email} className="invisible" />
        <Input
          {...register("code")}
          placeholder="Enter 6-digit code"
          classes={{ container: "my-6" }}
          autoComplete="one-time-code"
          error={errors.code?.message}
        />
      </fetcher.Form>

      <fetcher.Form
        className="flex items-center justify-between text-xs sm:text-sm font-medium"
        method="POST"
      >
        <input readOnly name="email" value={email} className="hidden" />
        <span>
          Trouble getting your code? Request a new one in: 00:
          {String(counter).padStart(2, "0")}
        </span>
        <button
          type="submit"
          name="intent"
          value="resend-otp"
          className="text-primary hover:text-primary active:text-primary disabled:text-muted-fg font-bold underline"
          disabled={counter > 0 || fetcher.state === "submitting"}
        >
          Resend code
        </button>
      </fetcher.Form>

      <button
        disabled={fetcher.state === "submitting"}
        form={form_id}
        type="submit"
        className="flex-center btn-primary h-12 sm:h-[52px] rounded sm:text-lg font-bold w-full mt-5"
      >
        Verify account
      </button>
    </div>
  );
}

function obscure_email(email: string) {
  const [username, domain] = email.split("@");

  const obscured_username =
    username.length > 3
      ? username.slice(0, 2) + "*".repeat(username.length - 2)
      : username.slice(0, 1) + "*".repeat(username.length - 1);

  const domain_parts = domain.split(".");
  const obscured_domain = domain_parts
    .map((part, index) => {
      // Keep TLD visible
      if (index === domain_parts.length - 1) {
        return part;
      }
      // Obscure domain name
      return part.length > 3
        ? part.slice(0, 2) + "*".repeat(part.length - 2)
        : part.slice(0, 1) + "*".repeat(part.length - 1);
    })
    .join(".");

  return `${obscured_username}@${obscured_domain}`;
}
